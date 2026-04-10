"""Fleet-wide audit commands for local scraper configs."""

from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import inspect
from pathlib import Path
import time
from typing import Any, Literal, cast

import click

from core.failure_classifier import FailureClassifier, FailureType
from scrapers.executor.workflow_executor import WorkflowExecutor
from scrapers.models.config import ScraperConfig, SelectorConfig
from validation.result_quality import canonicalize_product_payload, sanitize_product_payload

from .common import discover_config_paths, load_scraper_config, normalize_sku_list, project_root, write_json

AuditTier = Literal["positive", "negative", "edge"]
HealthStatus = Literal["Healthy", "Degraded", "Critical"]

TIER_LABELS: dict[AuditTier, str] = {
    "positive": "Positive Validation",
    "negative": "Negative Validation",
    "edge": "Boundary Testing",
}

FAILURE_FAMILY_LABELS = {
    "site_change": "Site Change",
    "anti_bot_block": "Anti-Bot Block",
    "navigation_failure": "Navigation Failure",
    "validation_failure": "Validation Failure",
    "authentication_failure": "Authentication Failure",
    "boundary_warning": "Boundary Warning",
    "configuration_failure": "Configuration Failure",
}

BLOCK_INDICATORS = (
    "access denied",
    "blocked",
    "captcha",
    "challenge",
    "cloudflare",
    "forbidden",
    "robot",
    "security check",
    "verify you are human",
)

FIELD_ALIAS_OVERRIDES = {
    "image": "images",
    "product_image": "images",
    "product_images": "images",
    "product_name": "title",
    "product_title": "title",
}

RUNTIME_METADATA_FIELDS = {
    "audit_tier",
    "base_url",
    "cohort_context",
    "current_url",
    "http_status",
    "no_results_found",
    "product",
    "search_result_validated",
    "validated_http_status",
    "validated_http_url",
}


@dataclass(slots=True)
class AuditFieldSpec:
    canonical_name: str
    display_name: str
    required: bool
    multiple: bool
    attribute: str | None
    display_names: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)

    def merge(
        self,
        *,
        display_name: str,
        required: bool,
        multiple: bool,
        attribute: str | None,
        source: str,
    ) -> None:
        self.required = self.required or required
        self.multiple = self.multiple or multiple
        if self.attribute is None and attribute is not None:
            self.attribute = attribute
        if display_name and display_name not in self.display_names:
            self.display_names.append(display_name)
        if source and source not in self.sources:
            self.sources.append(source)


@dataclass(slots=True, frozen=True)
class AuditCase:
    tier: AuditTier
    sku: str
    expectation: str


@dataclass(slots=True)
class AuditCaseResult:
    tier: AuditTier
    sku: str
    passed: bool
    severity: Literal["pass", "warning", "critical"]
    expectation: str
    duration_seconds: float
    workflow_success: bool
    no_results_found: bool
    failure_family: str | None
    failure_type: str | None
    current_url: str | None
    error_message: str | None
    suggestion: str | None
    required_fields_missing: list[str] = field(default_factory=list)
    invalid_required_fields: list[str] = field(default_factory=list)
    invalid_optional_fields: list[str] = field(default_factory=list)
    extracted_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    raw_results: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class FieldAuditResult:
    field_name: str
    display_names: list[str]
    required: bool
    evaluated_cases: int
    present_count: int
    valid_type_count: int
    presence_pct: float | None
    valid_type_pct: float | None
    consistently_missing: bool
    missing_skus: list[str] = field(default_factory=list)
    invalid_type_skus: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ScraperAuditResult:
    scraper: str
    display_name: str
    config_path: str
    status: HealthStatus
    score: float
    tier_summary: dict[str, dict[str, int]]
    cases: list[AuditCaseResult]
    field_audit: list[FieldAuditResult]
    required_coverage_pct: float
    optional_coverage_pct: float | None
    missing_tiers: list[str]
    consistently_missing_optional_fields: list[str]
    findings: list[dict[str, str]]


def _canonical_field_name(name: str) -> str:
    normalized = next(iter(canonicalize_product_payload({name: True})))
    return FIELD_ALIAS_OVERRIDES.get(normalized, normalized)


def _display_field_name(field_spec: AuditFieldSpec) -> str:
    if field_spec.display_names:
        return field_spec.display_names[0]
    return field_spec.display_name or field_spec.canonical_name


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set)):
        return any(_has_value(item) for item in value)
    if isinstance(value, dict):
        return bool(value)
    return True


def _is_scalar_value(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool))


def _is_valid_field_type(field_spec: AuditFieldSpec, value: Any, sanitized_value: Any) -> bool:
    candidate = sanitized_value if sanitized_value is not None else value
    if not _has_value(candidate):
        return False

    if field_spec.multiple:
        if not isinstance(candidate, (list, tuple)):
            return False
        return all(_is_scalar_value(item) for item in candidate if _has_value(item))

    if isinstance(candidate, (list, tuple, dict, set)):
        return False
    return _is_scalar_value(candidate)


def _register_field_spec(
    specs: dict[str, AuditFieldSpec],
    *,
    display_name: str,
    required: bool,
    multiple: bool,
    attribute: str | None,
    source: str,
) -> None:
    display_name = str(display_name).strip()
    if not display_name:
        return

    canonical_name = _canonical_field_name(display_name)
    if canonical_name in RUNTIME_METADATA_FIELDS or canonical_name.endswith("_url"):
        return
    existing = specs.get(canonical_name)

    if existing is None:
        specs[canonical_name] = AuditFieldSpec(
            canonical_name=canonical_name,
            display_name=display_name,
            required=required,
            multiple=multiple,
            attribute=attribute,
            display_names=[display_name],
            sources=[source],
        )
        return

    existing.merge(
        display_name=display_name,
        required=required,
        multiple=multiple,
        attribute=attribute,
        source=source,
    )


def _find_selector(config: ScraperConfig, identifier: object) -> SelectorConfig | None:
    needle = str(identifier or "").strip()
    if not needle:
        return None

    for selector in config.selectors:
        if selector.name == needle or selector.id == needle:
            return selector
    return None


def _collect_field_specs(config: ScraperConfig) -> dict[str, AuditFieldSpec]:
    specs: dict[str, AuditFieldSpec] = {}
    extracted_selector_names: set[str] = set()
    has_explicit_extraction = False

    for step in config.workflows:
        if step.action == "extract":
            has_explicit_extraction = True
            selector_ids = step.params.get("selector_ids")
            fields = step.params.get("fields")
            identifiers = selector_ids if isinstance(selector_ids, list) and selector_ids else fields if isinstance(fields, list) else []
            for identifier in identifiers:
                selector = _find_selector(config, identifier)
                if selector is not None:
                    extracted_selector_names.add(selector.name)
            continue

        if step.action == "extract_and_transform":
            has_explicit_extraction = True
            continue

        if step.action not in {"extract_single", "extract_multiple"}:
            continue

        has_explicit_extraction = True
        field_name = str(step.params.get("field") or "").strip()
        selector = _find_selector(config, step.params.get("selector_id") or step.params.get("selector"))
        if selector is not None and _canonical_field_name(field_name) == _canonical_field_name(selector.name):
            extracted_selector_names.add(selector.name)

    for selector in config.selectors:
        if has_explicit_extraction and selector.name not in extracted_selector_names:
            continue
        _register_field_spec(
            specs,
            display_name=selector.name,
            required=selector.required,
            multiple=selector.multiple,
            attribute=selector.attribute,
            source="selector",
        )

    for step in config.workflows:
        if step.action == "extract_and_transform":
            fields = step.params.get("fields", [])
            if not isinstance(fields, list):
                continue

            for field_config in fields:
                if not isinstance(field_config, dict):
                    continue
                _register_field_spec(
                    specs,
                    display_name=str(field_config.get("name") or ""),
                    required=bool(field_config.get("required", True)),
                    multiple=bool(field_config.get("multiple", False)),
                    attribute=cast(str | None, field_config.get("attribute")),
                    source="workflow:extract_and_transform",
                )
            continue

        if step.action not in {"extract_single", "extract_multiple"}:
            continue

        field_name = str(step.params.get("field") or "").strip()
        if not field_name:
            continue

        selector = _find_selector(config, step.params.get("selector_id") or step.params.get("selector"))
        required = bool(step.params.get("required", selector.required if selector else True))
        multiple = step.action == "extract_multiple"
        attribute = cast(str | None, step.params.get("attribute"))
        if attribute is None and selector is not None:
            attribute = selector.attribute

        _register_field_spec(
            specs,
            display_name=field_name,
            required=required,
            multiple=multiple,
            attribute=attribute,
            source=f"workflow:{step.action}",
        )

    _register_field_spec(
        specs,
        display_name="SKU",
        required=True,
        multiple=False,
        attribute=None,
        source="audit:context",
    )

    return specs


def _build_audit_cases(config: ScraperConfig, tier_limit: int | None) -> tuple[list[AuditCase], list[str]]:
    case_definitions: list[tuple[AuditTier, str, list[str]]] = [
        ("positive", "required fields extracted", normalize_sku_list(config.test_skus)),
        ("negative", "no results detected", normalize_sku_list(config.fake_skus)),
        ("edge", "boundary handled gracefully", normalize_sku_list(config.edge_case_skus)),
    ]
    cases: list[AuditCase] = []
    missing_tiers: list[str] = []

    for tier, expectation, skus in case_definitions:
        selected_skus = skus[:tier_limit] if tier_limit is not None else skus
        if not selected_skus:
            missing_tiers.append(TIER_LABELS[tier])
            continue
        for sku in selected_skus:
            cases.append(AuditCase(tier=tier, sku=sku, expectation=expectation))

    return cases, missing_tiers


def _safe_current_url(executor: WorkflowExecutor, payload_results: dict[str, Any] | None = None) -> str | None:
    if payload_results:
        for field_name in ("current_url", "validated_http_url"):
            value = payload_results.get(field_name)
            if isinstance(value, str) and value.strip():
                return value.strip()

    browser = getattr(executor, "browser", None)
    page = getattr(browser, "page", None) if browser is not None else None
    url = getattr(page, "url", None) if page is not None else None

    if isinstance(url, str) and url.strip():
        return url.strip()
    return None


def _looks_like_antibot(error_message: str, current_url: str | None) -> bool:
    haystack = " ".join(part for part in [error_message.lower(), (current_url or "").lower()] if part)
    return any(indicator in haystack for indicator in BLOCK_INDICATORS)


def _classify_failure(
    *,
    config: ScraperConfig,
    case: AuditCase,
    error_message: str,
    current_url: str | None,
) -> tuple[str, str, str]:
    if _looks_like_antibot(error_message, current_url):
        return (
            "anti_bot_block",
            FailureType.ACCESS_DENIED.value,
            "Review anti-detection settings, proxy/session rotation, and IP reputation for this vendor.",
        )

    classifier = FailureClassifier(
        site_specific_no_results_selectors=config.validation.no_results_selectors if config.validation else None,
        site_specific_no_results_text_patterns=config.validation.no_results_text_patterns if config.validation else None,
    )
    failure_context = classifier.classify_exception(
        Exception(error_message),
        {
            "action": "audit",
            "sku": case.sku,
            "site": config.name,
            "tier": case.tier,
            "url": current_url or "",
        },
    )
    failure_type = failure_context.failure_type

    if "login failed" in error_message.lower() or failure_type == FailureType.LOGIN_FAILED:
        return (
            "authentication_failure",
            failure_type.value,
            "Verify credential refs, login selectors, and success indicators for this scraper.",
        )

    if failure_type in {FailureType.CAPTCHA_DETECTED, FailureType.RATE_LIMITED, FailureType.ACCESS_DENIED}:
        return (
            "anti_bot_block",
            failure_type.value,
            "Review anti-detection settings, proxy/session rotation, and IP reputation for this vendor.",
        )

    if failure_type == FailureType.ELEMENT_MISSING:
        return (
            "site_change",
            failure_type.value,
            "Update selectors or workflow steps to match the vendor's current DOM.",
        )

    if failure_type == FailureType.TIMEOUT:
        if "element wait timed out" in error_message.lower() or "selector" in error_message.lower():
            return (
                "site_change",
                failure_type.value,
                "Update the waiting selectors or navigation checkpoints for the current page layout.",
            )
        return (
            "navigation_failure",
            failure_type.value,
            "Inspect redirects, load timing, and navigation waits for this vendor flow.",
        )

    if failure_type == FailureType.NO_RESULTS and case.tier == "negative":
        return (
            "validation_failure",
            failure_type.value,
            "Ensure fake SKUs trigger ValidationConfig no-results detection instead of raising workflow errors.",
        )

    if failure_type in {FailureType.PAGE_NOT_FOUND, FailureType.NO_RESULTS}:
        return (
            "site_change",
            failure_type.value,
            "Verify the configured test SKU still exists and update search/navigation logic if the site changed.",
        )

    return (
        "navigation_failure",
        failure_type.value,
        "Inspect navigation flow, target availability, and timeout settings for this scraper.",
    )


def _evaluate_successful_case(
    *,
    config: ScraperConfig,
    case: AuditCase,
    payload: dict[str, Any],
    duration_seconds: float,
    current_url: str | None,
    field_specs: dict[str, AuditFieldSpec],
) -> AuditCaseResult:
    workflow_success = payload.get("success") is True
    payload_results = cast(dict[str, Any], payload.get("results")) if isinstance(payload.get("results"), dict) else {}
    canonical_results = canonicalize_product_payload(payload_results)
    sanitized_results, sanitizer_warnings = sanitize_product_payload(canonical_results)
    no_results_found = bool(canonical_results.get("no_results_found"))

    required_fields_missing: list[str] = []
    invalid_required_fields: list[str] = []
    invalid_optional_fields: list[str] = []

    for field_name, field_spec in field_specs.items():
        raw_value = canonical_results.get(field_name)
        sanitized_value = sanitized_results.get(field_name)
        present = _has_value(raw_value)
        type_valid = present and _is_valid_field_type(field_spec, raw_value, sanitized_value)
        display_name = _display_field_name(field_spec)

        if field_spec.required and not present:
            required_fields_missing.append(display_name)
        elif field_spec.required and not type_valid:
            invalid_required_fields.append(display_name)
        elif not field_spec.required and present and not type_valid:
            invalid_optional_fields.append(display_name)

    extracted_fields = sorted(
        field_name
        for field_name, value in canonical_results.items()
        if field_name not in RUNTIME_METADATA_FIELDS and _has_value(value)
    )

    if not workflow_success:
        error_message = str(payload.get("error") or "workflow returned success=false")
        failure_family, failure_type, suggestion = _classify_failure(
            config=config,
            case=case,
            error_message=error_message,
            current_url=current_url,
        )
        return AuditCaseResult(
            tier=case.tier,
            sku=case.sku,
            passed=False,
            severity="critical",
            expectation=case.expectation,
            duration_seconds=duration_seconds,
            workflow_success=False,
            no_results_found=no_results_found,
            failure_family=failure_family,
            failure_type=failure_type,
            current_url=current_url,
            error_message=error_message,
            suggestion=suggestion,
            required_fields_missing=sorted(required_fields_missing),
            invalid_required_fields=sorted(invalid_required_fields),
            invalid_optional_fields=sorted(invalid_optional_fields),
            extracted_fields=extracted_fields,
            warnings=sanitizer_warnings,
            raw_results=canonical_results,
        )

    if case.tier == "positive":
        if no_results_found:
            return AuditCaseResult(
                tier=case.tier,
                sku=case.sku,
                passed=False,
                severity="critical",
                expectation=case.expectation,
                duration_seconds=duration_seconds,
                workflow_success=True,
                no_results_found=True,
                failure_family="site_change",
                failure_type=FailureType.NO_RESULTS.value,
                current_url=current_url,
                error_message="Positive validation SKU resolved to a no-results path.",
                suggestion="Verify the test SKU is still valid and update search or product navigation selectors if needed.",
                extracted_fields=extracted_fields,
                warnings=sanitizer_warnings,
                raw_results=canonical_results,
            )

        if required_fields_missing or invalid_required_fields:
            missing_details = []
            if required_fields_missing:
                missing_details.append(f"missing required fields: {', '.join(sorted(required_fields_missing))}")
            if invalid_required_fields:
                missing_details.append(f"invalid required fields: {', '.join(sorted(invalid_required_fields))}")
            return AuditCaseResult(
                tier=case.tier,
                sku=case.sku,
                passed=False,
                severity="critical",
                expectation=case.expectation,
                duration_seconds=duration_seconds,
                workflow_success=True,
                no_results_found=False,
                failure_family="site_change",
                failure_type=FailureType.ELEMENT_MISSING.value,
                current_url=current_url,
                error_message="; ".join(missing_details),
                suggestion="Update required selectors or extraction field mappings for this vendor.",
                required_fields_missing=sorted(required_fields_missing),
                invalid_required_fields=sorted(invalid_required_fields),
                invalid_optional_fields=sorted(invalid_optional_fields),
                extracted_fields=extracted_fields,
                warnings=sanitizer_warnings,
                raw_results=canonical_results,
            )

        case_warnings = list(sanitizer_warnings)
        if invalid_optional_fields:
            case_warnings.append(f"Invalid optional fields: {', '.join(sorted(invalid_optional_fields))}")

        return AuditCaseResult(
            tier=case.tier,
            sku=case.sku,
            passed=True,
            severity="warning" if case_warnings else "pass",
            expectation=case.expectation,
            duration_seconds=duration_seconds,
            workflow_success=True,
            no_results_found=False,
            failure_family="boundary_warning" if case_warnings else None,
            failure_type=None,
            current_url=current_url,
            error_message=None,
            suggestion="Review optional field quality for this vendor." if case_warnings else None,
            invalid_optional_fields=sorted(invalid_optional_fields),
            extracted_fields=extracted_fields,
            warnings=case_warnings,
            raw_results=canonical_results,
        )

    if case.tier == "negative":
        if no_results_found:
            return AuditCaseResult(
                tier=case.tier,
                sku=case.sku,
                passed=True,
                severity="pass",
                expectation=case.expectation,
                duration_seconds=duration_seconds,
                workflow_success=True,
                no_results_found=True,
                failure_family=None,
                failure_type=None,
                current_url=current_url,
                error_message=None,
                suggestion=None,
                extracted_fields=extracted_fields,
                warnings=sanitizer_warnings,
                raw_results=canonical_results,
            )

        return AuditCaseResult(
            tier=case.tier,
            sku=case.sku,
            passed=False,
            severity="critical",
            expectation=case.expectation,
            duration_seconds=duration_seconds,
            workflow_success=True,
            no_results_found=False,
            failure_family="validation_failure",
            failure_type=FailureType.NO_RESULTS.value,
            current_url=current_url,
            error_message="Fake SKU did not trigger no-results detection.",
            suggestion="Update ValidationConfig selectors/text patterns or confirm the fake SKU is still invalid.",
            extracted_fields=extracted_fields,
            warnings=sanitizer_warnings,
            raw_results=canonical_results,
        )

    edge_warnings = list(sanitizer_warnings)
    if not no_results_found and (required_fields_missing or invalid_required_fields):
        edge_warnings.append("Boundary case completed without crashing but omitted required product fields.")
    if not no_results_found and not extracted_fields:
        edge_warnings.append("Boundary case completed without extracted product data.")
    if invalid_optional_fields:
        edge_warnings.append(f"Invalid optional fields: {', '.join(sorted(invalid_optional_fields))}")

    return AuditCaseResult(
        tier=case.tier,
        sku=case.sku,
        passed=True,
        severity="warning" if edge_warnings else "pass",
        expectation=case.expectation,
        duration_seconds=duration_seconds,
        workflow_success=True,
        no_results_found=no_results_found,
        failure_family="boundary_warning" if edge_warnings else None,
        failure_type=None,
        current_url=current_url,
        error_message=None,
        suggestion="Review boundary-state handling for this vendor." if edge_warnings else None,
        required_fields_missing=sorted(required_fields_missing),
        invalid_required_fields=sorted(invalid_required_fields),
        invalid_optional_fields=sorted(invalid_optional_fields),
        extracted_fields=extracted_fields,
        warnings=edge_warnings,
        raw_results=canonical_results,
    )


def _evaluate_failed_case(
    *,
    config: ScraperConfig,
    case: AuditCase,
    error: Exception,
    duration_seconds: float,
    current_url: str | None,
) -> AuditCaseResult:
    error_message = str(error)
    failure_family, failure_type, suggestion = _classify_failure(
        config=config,
        case=case,
        error_message=error_message,
        current_url=current_url,
    )

    return AuditCaseResult(
        tier=case.tier,
        sku=case.sku,
        passed=False,
        severity="critical",
        expectation=case.expectation,
        duration_seconds=duration_seconds,
        workflow_success=False,
        no_results_found=False,
        failure_family=failure_family,
        failure_type=failure_type,
        current_url=current_url,
        error_message=error_message,
        suggestion=suggestion,
    )


async def _execute_case(
    *,
    config: ScraperConfig,
    case: AuditCase,
    field_specs: dict[str, AuditFieldSpec],
    headless: bool,
) -> AuditCaseResult:
    executor = WorkflowExecutor(
        config,
        headless=headless,
        timeout=config.timeout,
        worker_id=f"cli-audit-{config.name}",
        debug_mode=False,
    )
    started_at = time.perf_counter()

    try:
        payload = await executor.execute_workflow(
            context={"sku": case.sku, "audit_tier": case.tier},
            quit_browser=False,
        )
        duration_seconds = round(time.perf_counter() - started_at, 2)
        payload_results = cast(dict[str, Any], payload.get("results")) if isinstance(payload.get("results"), dict) else {}
        return _evaluate_successful_case(
            config=config,
            case=case,
            payload=payload,
            duration_seconds=duration_seconds,
            current_url=_safe_current_url(executor, payload_results),
            field_specs=field_specs,
        )
    except Exception as error:
        duration_seconds = round(time.perf_counter() - started_at, 2)
        return _evaluate_failed_case(
            config=config,
            case=case,
            error=error,
            duration_seconds=duration_seconds,
            current_url=_safe_current_url(executor),
        )
    finally:
        browser = executor.browser
        if browser is not None:
            maybe_awaitable = browser.quit()
            if inspect.isawaitable(maybe_awaitable):
                await maybe_awaitable


async def _run_scraper_audit(
    *,
    config: ScraperConfig,
    cases: list[AuditCase],
    field_specs: dict[str, AuditFieldSpec],
    headless: bool,
) -> list[AuditCaseResult]:
    case_results: list[AuditCaseResult] = []

    for index, case in enumerate(cases, start=1):
        click.echo(f"    [{index}/{len(cases)}] {TIER_LABELS[case.tier]} -> {case.sku}")
        case_result = await _execute_case(
            config=config,
            case=case,
            field_specs=field_specs,
            headless=headless,
        )
        color = "green"
        if case_result.severity == "warning":
            color = "yellow"
        elif case_result.severity == "critical":
            color = "red"

        label = "PASS" if case_result.severity == "pass" else "WARN" if case_result.severity == "warning" else "FAIL"
        detail = case_result.error_message or (case_result.warnings[0] if case_result.warnings else case.expectation)
        click.secho(f"      {label} {detail}", fg=color)
        case_results.append(case_result)

    return case_results


def _build_field_audit(
    field_specs: dict[str, AuditFieldSpec],
    case_results: list[AuditCaseResult],
) -> list[FieldAuditResult]:
    product_cases = [case for case in case_results if case.workflow_success and case.tier in {"positive", "edge"} and not case.no_results_found]
    audit_rows: list[FieldAuditResult] = []

    for field_name in sorted(field_specs):
        field_spec = field_specs[field_name]
        present_count = 0
        valid_type_count = 0
        missing_skus: list[str] = []
        invalid_type_skus: list[str] = []

        for case in product_cases:
            raw_value = case.raw_results.get(field_name)
            present = _has_value(raw_value)
            sanitized_results, _ = sanitize_product_payload(case.raw_results)
            sanitized_value = sanitized_results.get(field_name)

            if present:
                present_count += 1
                if _is_valid_field_type(field_spec, raw_value, sanitized_value):
                    valid_type_count += 1
                else:
                    invalid_type_skus.append(case.sku)
            else:
                missing_skus.append(case.sku)

        evaluated_cases = len(product_cases)
        presence_pct = round((present_count / evaluated_cases) * 100, 1) if evaluated_cases else None
        valid_type_pct = round((valid_type_count / present_count) * 100, 1) if present_count else None

        audit_rows.append(
            FieldAuditResult(
                field_name=field_name,
                display_names=field_spec.display_names or [field_spec.display_name],
                required=field_spec.required,
                evaluated_cases=evaluated_cases,
                present_count=present_count,
                valid_type_count=valid_type_count,
                presence_pct=presence_pct,
                valid_type_pct=valid_type_pct,
                consistently_missing=evaluated_cases > 0 and present_count == 0,
                missing_skus=missing_skus,
                invalid_type_skus=invalid_type_skus,
            )
        )

    return audit_rows


def _summarize_tiers(case_results: list[AuditCaseResult]) -> dict[str, dict[str, int]]:
    summary = {
        "positive": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
        "negative": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
        "edge": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
    }

    for case in case_results:
        tier_summary = summary[case.tier]
        tier_summary["total"] += 1
        if case.passed:
            tier_summary["passed"] += 1
        if case.severity == "warning":
            tier_summary["warnings"] += 1
        if case.severity == "critical":
            tier_summary["failed"] += 1

    return summary


def _coverage_average(rows: list[FieldAuditResult]) -> float | None:
    percentages = [row.presence_pct for row in rows if row.presence_pct is not None]
    if not percentages:
        return None
    return round(sum(percentages) / len(percentages), 1)


def _build_findings(
    *,
    status: HealthStatus,
    missing_tiers: list[str],
    case_results: list[AuditCaseResult],
    field_audit: list[FieldAuditResult],
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []

    for tier in missing_tiers:
        findings.append(
            {
                "severity": "Critical",
                "category": FAILURE_FAMILY_LABELS["configuration_failure"],
                "summary": f"Missing configured audit SKUs for {tier}.",
                "action": "Populate the missing SKU tier in the scraper YAML before relying on fleet-wide audit coverage.",
            }
        )

    for case in case_results:
        if case.severity == "critical":
            findings.append(
                {
                    "severity": "Critical",
                    "category": FAILURE_FAMILY_LABELS.get(case.failure_family or "", "Audit Failure"),
                    "summary": f"{TIER_LABELS[case.tier]} failed for {case.sku}: {case.error_message or case.expectation}",
                    "action": case.suggestion or "Inspect the scraper workflow for this vendor.",
                }
            )
        elif case.severity == "warning":
            findings.append(
                {
                    "severity": "Degraded",
                    "category": FAILURE_FAMILY_LABELS.get(case.failure_family or "", "Audit Warning"),
                    "summary": f"{TIER_LABELS[case.tier]} warning for {case.sku}: {'; '.join(case.warnings)}",
                    "action": case.suggestion or "Review the boundary-state handling for this workflow.",
                }
            )

    consistently_missing_optional = [
        row.display_names[0]
        for row in field_audit
        if not row.required and row.consistently_missing and row.evaluated_cases > 0
    ]
    if consistently_missing_optional:
        findings.append(
            {
                "severity": "Degraded" if status != "Critical" else "Critical",
                "category": "Optional Field Coverage",
                "summary": f"Optional fields always missing: {', '.join(sorted(consistently_missing_optional))}.",
                "action": "Review optional selector quality for this vendor and confirm whether the fields are still obtainable.",
            }
        )

    return findings


def _build_scraper_result(
    *,
    config: ScraperConfig,
    config_path: Path,
    missing_tiers: list[str],
    case_results: list[AuditCaseResult],
    field_specs: dict[str, AuditFieldSpec],
) -> ScraperAuditResult:
    tier_summary = _summarize_tiers(case_results)
    field_audit = _build_field_audit(field_specs, case_results)
    required_rows = [row for row in field_audit if row.required]
    optional_rows = [row for row in field_audit if not row.required]
    required_coverage_pct = _coverage_average(required_rows) or 0.0
    optional_coverage_pct = _coverage_average(optional_rows)

    positive_rate = tier_summary["positive"]["passed"] / tier_summary["positive"]["total"] if tier_summary["positive"]["total"] else 0.0
    negative_rate = tier_summary["negative"]["passed"] / tier_summary["negative"]["total"] if tier_summary["negative"]["total"] else 0.0
    edge_rate = tier_summary["edge"]["passed"] / tier_summary["edge"]["total"] if tier_summary["edge"]["total"] else 0.0
    required_coverage_ratio = required_coverage_pct / 100 if required_rows else 1.0
    optional_coverage_ratio = (optional_coverage_pct / 100) if optional_coverage_pct is not None else 1.0

    score = round(
        (
            positive_rate * 0.4
            + negative_rate * 0.25
            + edge_rate * 0.15
            + required_coverage_ratio * 0.15
            + optional_coverage_ratio * 0.05
        )
        * 100,
        1,
    )

    consistently_missing_optional_fields = sorted(
        row.display_names[0]
        for row in optional_rows
        if row.consistently_missing and row.evaluated_cases > 0
    )
    has_critical = bool(missing_tiers) or any(case.severity == "critical" for case in case_results)
    has_degraded = bool(consistently_missing_optional_fields) or any(case.severity == "warning" for case in case_results)

    status: HealthStatus
    if has_critical:
        status = "Critical"
    elif has_degraded:
        status = "Degraded"
    else:
        status = "Healthy"

    findings = _build_findings(
        status=status,
        missing_tiers=missing_tiers,
        case_results=case_results,
        field_audit=field_audit,
    )

    return ScraperAuditResult(
        scraper=config.name,
        display_name=config.display_name or config.name,
        config_path=str(config_path),
        status=status,
        score=score,
        tier_summary=tier_summary,
        cases=case_results,
        field_audit=field_audit,
        required_coverage_pct=required_coverage_pct,
        optional_coverage_pct=optional_coverage_pct,
        missing_tiers=missing_tiers,
        consistently_missing_optional_fields=consistently_missing_optional_fields,
        findings=findings,
    )


def _build_config_failure_result(config_path: Path, error_message: str) -> ScraperAuditResult:
    finding = {
        "severity": "Critical",
        "category": FAILURE_FAMILY_LABELS["configuration_failure"],
        "summary": f"Failed to load scraper config: {error_message}",
        "action": "Fix the YAML or schema validation error before running the audit again.",
    }
    return ScraperAuditResult(
        scraper=config_path.stem,
        display_name=config_path.stem,
        config_path=str(config_path),
        status="Critical",
        score=0.0,
        tier_summary={
            "positive": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
            "negative": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
            "edge": {"total": 0, "passed": 0, "warnings": 0, "failed": 0},
        },
        cases=[],
        field_audit=[],
        required_coverage_pct=0.0,
        optional_coverage_pct=None,
        missing_tiers=[TIER_LABELS["positive"], TIER_LABELS["negative"], TIER_LABELS["edge"]],
        consistently_missing_optional_fields=[],
        findings=[finding],
    )


def _status_sort_key(status: HealthStatus) -> tuple[int, str]:
    order = {"Healthy": 0, "Degraded": 1, "Critical": 2}
    return order[status], status


def _summarize_fleet(results: list[ScraperAuditResult]) -> dict[str, Any]:
    healthy = sum(1 for result in results if result.status == "Healthy")
    degraded = sum(1 for result in results if result.status == "Degraded")
    critical = sum(1 for result in results if result.status == "Critical")
    average_score = round(sum(result.score for result in results) / len(results), 1) if results else 0.0

    return {
        "scrapers_audited": len(results),
        "healthy": healthy,
        "degraded": degraded,
        "critical": critical,
        "average_score": average_score,
    }


def _format_tier_cell(tier_summary: dict[str, int]) -> str:
    return f"{tier_summary['passed']}/{tier_summary['total']}"


def _format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.1f}%"


def _relative_artifact_path(path: Path) -> str:
    try:
        return str(path.relative_to(project_root()))
    except ValueError:
        return str(path)


def _truncate_list(values: list[str], *, limit: int = 3) -> str:
    if not values:
        return "None"
    if len(values) <= limit:
        return ", ".join(values)
    return ", ".join(values[:limit]) + f" (+{len(values) - limit} more)"


def _build_markdown_report(
    *,
    results: list[ScraperAuditResult],
    summary: dict[str, Any],
    json_path: Path,
) -> str:
    lines = [
        "# Fleet Health Matrix",
        "",
        f"**Generated At:** {datetime.now(timezone.utc).isoformat()}",
        f"**Structured JSON:** `{_relative_artifact_path(json_path)}`",
        "",
        "## Fleet Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Scrapers Audited | {summary['scrapers_audited']} |",
        f"| Healthy | {summary['healthy']} |",
        f"| Degraded | {summary['degraded']} |",
        f"| Critical | {summary['critical']} |",
        f"| Average Score | {summary['average_score']:.1f} |",
        "",
        "## Health Ranking",
        "",
        "| Scraper | Status | Score | Positive | Negative | Edge | Required Coverage | Optional Coverage | Notes |",
        "|---------|--------|-------|----------|----------|------|-------------------|-------------------|-------|",
    ]

    ranked_results = sorted(
        results,
        key=lambda item: (_status_sort_key(item.status)[0], -item.score, item.scraper.lower()),
    )

    for result in ranked_results:
        notes: list[str] = []
        if result.consistently_missing_optional_fields:
            notes.append(f"Optional fields always missing: {', '.join(result.consistently_missing_optional_fields)}")
        if result.findings:
            notes.extend(finding["category"] for finding in result.findings[:2])

        lines.append(
            "| {scraper} | {status} | {score:.1f} | {positive} | {negative} | {edge} | {required} | {optional} | {notes} |".format(
                scraper=result.scraper,
                status=result.status,
                score=result.score,
                positive=_format_tier_cell(result.tier_summary["positive"]),
                negative=_format_tier_cell(result.tier_summary["negative"]),
                edge=_format_tier_cell(result.tier_summary["edge"]),
                required=_format_pct(result.required_coverage_pct),
                optional=_format_pct(result.optional_coverage_pct),
                notes="; ".join(dict.fromkeys(notes)) or "None",
            )
        )

    for result in ranked_results:
        lines.extend(
            [
                "",
                f"## {result.scraper} — {result.status}",
                "",
                f"- **Config:** `{result.config_path}`",
                f"- **Score:** {result.score:.1f}",
                f"- **Required Coverage:** {_format_pct(result.required_coverage_pct)}",
                f"- **Optional Coverage:** {_format_pct(result.optional_coverage_pct)}",
                "",
                "### Tier Summary",
                "",
                "| Tier | Total | Passed | Warnings | Failed |",
                "|------|-------|--------|----------|--------|",
            ]
        )

        for tier in ("positive", "negative", "edge"):
            tier_summary = result.tier_summary[tier]
            lines.append(
                "| {tier} | {total} | {passed} | {warnings} | {failed} |".format(
                    tier=TIER_LABELS[cast(AuditTier, tier)],
                    total=tier_summary["total"],
                    passed=tier_summary["passed"],
                    warnings=tier_summary["warnings"],
                    failed=tier_summary["failed"],
                )
            )

        lines.extend(["", "### Field Audit", ""])
        if result.field_audit:
            lines.extend(
                [
                    "| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |",
                    "|-------|----------|----------|------------|--------------|--------------|",
                ]
            )
            for row in result.field_audit:
                lines.append(
                    "| {field} | {required} | {presence} | {valid} | {missing} | {invalid} |".format(
                        field=", ".join(row.display_names),
                        required="Yes" if row.required else "No",
                        presence=_format_pct(row.presence_pct),
                        valid=_format_pct(row.valid_type_pct),
                        missing=_truncate_list(row.missing_skus),
                        invalid=_truncate_list(row.invalid_type_skus),
                    )
                )
        else:
            lines.append("No successful product-bearing cases were available for field coverage analysis.")

        lines.extend(["", "### Findings", ""])
        if result.findings:
            for finding in result.findings:
                lines.append(
                    f"- **{finding['severity']} — {finding['category']}**: {finding['summary']} Action: {finding['action']}"
                )
        else:
            lines.append("- No audit findings.")

        critical_cases = [case for case in result.cases if case.severity == "critical"]
        if critical_cases:
            lines.extend(
                [
                    "",
                    "### Actionable Failure Logs",
                    "",
                    "| Tier | SKU | Category | Failure Type | URL | Error | Suggested Action |",
                    "|------|-----|----------|--------------|-----|-------|------------------|",
                ]
            )
            for case in critical_cases:
                lines.append(
                    "| {tier} | {sku} | {category} | {failure_type} | {url} | {error} | {action} |".format(
                        tier=TIER_LABELS[case.tier],
                        sku=case.sku,
                        category=FAILURE_FAMILY_LABELS.get(case.failure_family or "", "Audit Failure"),
                        failure_type=case.failure_type or "unknown",
                        url=case.current_url or "n/a",
                        error=(case.error_message or "n/a").replace("|", "/"),
                        action=(case.suggestion or "Inspect the scraper workflow.").replace("|", "/"),
                    )
                )

    return "\n".join(lines) + "\n"


def _default_markdown_output() -> Path:
    return project_root() / ".artifacts" / "audits" / "fleet-health-matrix.md"


def _default_json_output() -> Path:
    return project_root() / ".artifacts" / "audits" / "fleet-health-matrix.json"


@click.command(name="run")
@click.option("--all", "run_all", is_flag=True, help="Audit all local scraper configs.")
@click.option("--scraper", "scrapers", multiple=True, help="Specific scraper config name(s) to audit.")
@click.option("--config", "config_paths", multiple=True, type=click.Path(path_type=Path), help="Specific local config file(s) to audit.")
@click.option("--tier-limit", type=click.IntRange(min=1), help="Optional per-tier SKU limit.")
@click.option("--output", "output_path", type=click.Path(path_type=Path), help="Markdown output path.")
@click.option("--json-output", type=click.Path(path_type=Path), help="Structured JSON output path.")
@click.option("--headless/--no-headless", default=True, show_default=True, help="Run browsers headless during audit execution.")
@click.option("--fail-on-critical/--no-fail-on-critical", default=False, show_default=True, help="Exit non-zero when any scraper is ranked Critical.")
def run_audit_command(
    run_all: bool,
    scrapers: tuple[str, ...],
    config_paths: tuple[Path, ...],
    tier_limit: int | None,
    output_path: Path | None,
    json_output: Path | None,
    headless: bool,
    fail_on_critical: bool,
) -> None:
    """Run a fleet-wide scraper audit against local YAML configs."""

    if run_all and (scrapers or config_paths):
        raise click.ClickException("Use --all by itself or target explicit scrapers/configs without --all.")

    if not run_all and not scrapers and not config_paths:
        raise click.ClickException("Pass --all, --scraper, or --config.")

    if run_all:
        resolved_config_paths = discover_config_paths()
    else:
        resolved_config_paths = discover_config_paths(
            scrapers=scrapers,
            config_paths=config_paths,
        )

    if not resolved_config_paths:
        raise click.ClickException("No scraper configs found for audit.")

    click.secho("Fleet audit setup", bold=True)
    click.echo(f"  Configs selected: {len(resolved_config_paths)}")
    click.echo(f"  Tier limit: {tier_limit or 'all configured SKUs'}")
    click.echo(f"  Headless: {'yes' if headless else 'no'}")

    scraper_results: list[ScraperAuditResult] = []

    for config_path in resolved_config_paths:
        click.echo()
        click.secho(f"Auditing {config_path.stem}", bold=True)

        try:
            config = load_scraper_config(config_path)
        except click.ClickException as error:
            click.secho(f"  FAIL could not load config: {error}", fg="red")
            scraper_results.append(_build_config_failure_result(config_path, str(error)))
            continue

        field_specs = _collect_field_specs(config)
        cases, missing_tiers = _build_audit_cases(config, tier_limit)
        click.echo(f"  Cases scheduled: {len(cases)}")
        if missing_tiers:
            click.secho(f"  Missing tiers: {', '.join(missing_tiers)}", fg="yellow")

        case_results = asyncio.run(
            _run_scraper_audit(
                config=config,
                cases=cases,
                field_specs=field_specs,
                headless=headless,
            )
        ) if cases else []

        scraper_result = _build_scraper_result(
            config=config,
            config_path=config_path,
            missing_tiers=missing_tiers,
            case_results=case_results,
            field_specs=field_specs,
        )
        scraper_results.append(scraper_result)
        status_color = "green" if scraper_result.status == "Healthy" else "yellow" if scraper_result.status == "Degraded" else "red"
        click.secho(
            f"  Result: {scraper_result.status} ({scraper_result.score:.1f})",
            fg=status_color,
        )

    summary = _summarize_fleet(scraper_results)
    markdown_path = output_path or _default_markdown_output()
    json_path = json_output or _default_json_output()

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "scrapers": [asdict(result) for result in scraper_results],
    }
    write_json(json_path, payload)
    markdown = _build_markdown_report(results=scraper_results, summary=summary, json_path=json_path)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    _ = markdown_path.write_text(markdown, encoding="utf-8")

    click.echo()
    click.secho("Fleet audit complete", bold=True)
    click.echo(f"  Healthy: {summary['healthy']}")
    click.echo(f"  Degraded: {summary['degraded']}")
    click.echo(f"  Critical: {summary['critical']}")
    click.echo(f"  Markdown report: {markdown_path.resolve()}")
    click.echo(f"  JSON report: {json_path.resolve()}")

    if fail_on_critical and summary["critical"] > 0:
        raise click.ClickException("Fleet audit reported one or more Critical scrapers.")


def register_audit_commands(audit_group: click.Group) -> None:
    audit_group.add_command(run_audit_command)
