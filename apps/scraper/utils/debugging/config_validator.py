"""
Config Validator - YAML schema validation before execution.

Provides comprehensive validation of scraper configuration files with:
- Schema validation using Pydantic models
- Action name validation (checks registered actions)
- Selector reference validation
- Detailed error messages with context
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml  # type: ignore

logger = logging.getLogger(__name__)


INLINE_SELECTOR_ACTIONS = {
    "click",
    "conditional_click",
    "input_text",
    "navigate",
    "verify",
    "wait_for",
    "wait_for_hidden",
}


class ConfigValidationError(Exception):
    """Raised when configuration validation fails."""

    def __init__(self, message: str, errors: list[str] | None = None):
        self.message = message
        self.errors = errors or []
        super().__init__(message)


@dataclass
class ValidationResult:
    """Result of configuration validation."""

    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    actionable_warnings: list[str] = field(default_factory=list)
    config_name: str | None = None
    file_path: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        status = "VALID" if self.valid else "INVALID"
        lines = [f"Validation Result: {status}"]
        if self.config_name:
            lines.append(f"Config: {self.config_name}")
        if self.file_path:
            lines.append(f"File: {self.file_path}")
        if self.errors:
            lines.append(f"Errors ({len(self.errors)}):")
            for err in self.errors:
                lines.append(f"  - {err}")
        if self.warnings:
            lines.append(f"Warnings ({len(self.warnings)}):")
            for warn in self.warnings:
                lines.append(f"  - {warn}")
        if self.actionable_warnings:
            lines.append(f"Actionable Warnings ({len(self.actionable_warnings)}):")
            for warn in self.actionable_warnings:
                lines.append(f"  - {warn}")
        return "\n".join(lines)


@dataclass
class LocalRuntimePreflight:
    """Preflight details for local config execution."""

    valid: bool
    config_path: str
    config_name: str | None = None
    uses_login: bool = False
    credential_refs: list[str] = field(default_factory=list)
    credential_sources: dict[str, str] = field(default_factory=dict)
    missing_credential_refs: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    actionable_warnings: list[str] = field(default_factory=list)


def build_local_validation_payload(
    validation_result: ValidationResult,
    preflight: LocalRuntimePreflight,
) -> dict[str, object]:
    return {
        "valid": validation_result.valid and preflight.valid,
        "config_name": validation_result.config_name,
        "file_path": validation_result.file_path or preflight.config_path,
        "errors": _dedupe_items([*validation_result.errors, *preflight.errors]),
        "warnings": _dedupe_items([*validation_result.warnings, *preflight.warnings]),
        "actionable_warnings": _dedupe_items(
            [*validation_result.actionable_warnings, *preflight.actionable_warnings]
        ),
        "metadata": {
            **(validation_result.metadata or {}),
            "uses_login": preflight.uses_login,
            "credential_refs": preflight.credential_refs,
            "credential_sources": preflight.credential_sources,
            "missing_credential_refs": preflight.missing_credential_refs,
        },
    }


def format_local_validation_payload(payload: dict[str, object]) -> str:
    lines = [
        f"Validation Result: {'VALID' if payload.get('valid') else 'INVALID'}",
    ]

    config_name = payload.get("config_name")
    if isinstance(config_name, str) and config_name:
        lines.append(f"Config: {config_name}")

    file_path = payload.get("file_path")
    if isinstance(file_path, str) and file_path:
        lines.append(f"File: {file_path}")

    for key, label in (
        ("errors", "Errors"),
        ("warnings", "Warnings"),
        ("actionable_warnings", "Actionable Warnings"),
    ):
        values = payload.get(key)
        if not isinstance(values, list) or not values:
            continue
        lines.append(f"{label} ({len(values)}):")
        for value in values:
            lines.append(f"  - {value}")

    metadata = payload.get("metadata")
    if isinstance(metadata, dict) and metadata.get("uses_login"):
        lines.append("Login Runtime:")
        credential_refs = metadata.get("credential_refs")
        if isinstance(credential_refs, list) and credential_refs:
            lines.append(f"  - credential_refs: {', '.join(str(ref) for ref in credential_refs)}")
        credential_sources = metadata.get("credential_sources")
        if isinstance(credential_sources, dict) and credential_sources:
            for ref, source in credential_sources.items():
                lines.append(f"  - {ref}: {source}")
        missing_refs = metadata.get("missing_credential_refs")
        if isinstance(missing_refs, list) and missing_refs:
            lines.append(
                "  - missing credential refs: "
                + ", ".join(str(ref) for ref in missing_refs)
            )

    return "\n".join(lines)


def _dedupe_items(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _extract_login_selector_map(login_config: Any) -> dict[str, str]:
    if hasattr(login_config, "model_dump"):
        candidate = login_config.model_dump()
    else:
        candidate = login_config

    if not isinstance(candidate, dict):
        return {}

    selector_map: dict[str, str] = {}
    for key in ("username_field", "password_field", "submit_button", "success_indicator"):
        value = candidate.get(key)
        if isinstance(value, str) and value.strip():
            selector_map[key] = value.strip()
    return selector_map


def _normalize_credential_ref(value: Any) -> str:
    return str(value or "").strip()


def _detect_credential_source(ref: str) -> str | None:
    if not ref:
        return None

    from core.api_client import ScraperAPIClient

    prefix = ref.upper().replace("-", "_")
    username_key = f"{prefix}_USERNAME"
    password_key = f"{prefix}_PASSWORD"
    api_url_present = bool(str(os.environ.get("SCRAPER_API_URL", "")).strip())
    api_key_present = bool(str(os.environ.get("SCRAPER_API_KEY", "")).strip())

    env_creds = ScraperAPIClient.get_credentials_from_env(ref)
    if env_creds:
        return f"env ({username_key}/{password_key})"

    try:
        supabase_creds = ScraperAPIClient.get_credentials_from_supabase(ref)
    except Exception as exc:
        logger.debug("Supabase credential preflight failed for %s: %s", ref, exc, exc_info=True)
        supabase_creds = None
    if supabase_creds:
        return "supabase"

    if api_url_present and api_key_present:
        return "api (deferred runtime lookup)"

    return None


def validate_local_runtime_requirements(
    file_path: str | Path,
    *,
    strict: bool = False,
    validation_result: ValidationResult | None = None,
) -> LocalRuntimePreflight:
    """Validate local runtime readiness for a YAML config path."""

    if validation_result is None:
        validator = ConfigValidator(strict=strict)
        validation_result = validator.validate_file(file_path)
    config_path = str(Path(file_path))

    if not validation_result.valid:
        return LocalRuntimePreflight(
            valid=False,
            config_path=config_path,
            config_name=validation_result.config_name,
            errors=list(validation_result.errors),
            warnings=list(validation_result.warnings),
            actionable_warnings=list(validation_result.actionable_warnings),
        )

    config_metadata = validation_result.metadata or {}
    uses_login = bool(config_metadata.get("requires_login"))
    raw_refs = config_metadata.get("runtime_credential_refs", [])
    credential_refs = [ref for ref in (_normalize_credential_ref(value) for value in raw_refs) if ref]
    credential_sources: dict[str, str] = {}
    missing_credential_refs: list[str] = []
    warnings = list(validation_result.warnings)
    actionable_warnings = list(validation_result.actionable_warnings)
    errors = list(validation_result.errors)

    if uses_login:
        if not credential_refs:
            errors.append(
                "Login-enabled config has no runtime credential candidates. Add 'credential_refs' or provide env credentials for the scraper slug."
            )
        else:
            for ref in credential_refs:
                source = _detect_credential_source(ref)
                if source:
                    credential_sources[ref] = source
                else:
                    missing_credential_refs.append(ref)

            if missing_credential_refs:
                actionable_warnings.append(
                    "Local login test cannot confirm credentials for refs: "
                    + ", ".join(missing_credential_refs)
                    + ". Set SCRAPER_API_URL/SCRAPER_API_KEY, Supabase env, or vendor env credentials before running local mode."
                )

    valid = len(errors) == 0
    return LocalRuntimePreflight(
        valid=valid,
        config_path=config_path,
        config_name=validation_result.config_name,
        uses_login=uses_login,
        credential_refs=credential_refs,
        credential_sources=credential_sources,
        missing_credential_refs=missing_credential_refs,
        errors=_dedupe_items(errors),
        warnings=_dedupe_items(warnings),
        actionable_warnings=_dedupe_items(actionable_warnings),
    )


class ConfigValidator:
    """
    Validates scraper configuration files before execution.

    Performs:
    - YAML syntax validation
    - Pydantic schema validation (ScraperConfig)
    - Action name validation (checks against registered actions)
    - Selector reference validation (extract actions reference valid selectors)
    - Best practice warnings
    """

    # Known valid action names (from ActionRegistry)
    KNOWN_ACTIONS = {
        "navigate",
        "wait",
        "wait_for",
        "wait_for_hidden",
        "click",
        "conditional_click",
        "input_text",
        "extract",
        "extract_single",
        "extract_multiple",
        "extract_and_transform",
        "extract_from_json",
        "check_no_results",
        "conditional_skip",
        "validate_http_status",
        "validate_search_result",
        "verify",
        "verify_value",
        "verify_sku_on_page",
        "scroll",
        "login",
        "detect_captcha",
        "handle_blocking",
        "rate_limit",
        "simulate_human",
        "rotate_session",
        "configure_browser",
        "combine_fields",
        "conditional",
        "process_images",
        "extract_from_json",
        "execute_script",
        "check_sponsored",
        "parse_table",
        "transform_value",
        "parse_weight",
        "filter_brand",
        "set_proxy",
    }

    def __init__(self, strict: bool = False):
        """
        Initialize the config validator.

        Args:
            strict: If True, treat warnings as errors
        """
        self.strict = strict
        self._registered_actions: set[str] | None = None

    def _get_registered_actions(self) -> set[str]:
        """Get dynamically registered actions from ActionRegistry."""
        if self._registered_actions is not None:
            return self._registered_actions

        try:
            from scrapers.actions import ActionRegistry

            ActionRegistry.auto_discover_actions()
            self._registered_actions = set(
                ActionRegistry.get_registered_actions().keys()
            )
            return self._registered_actions
        except ImportError:
            logger.warning("Could not import ActionRegistry, using static action list")
            return self.KNOWN_ACTIONS

    def validate_file(self, file_path: str | Path) -> ValidationResult:
        """
        Validate a YAML configuration file.

        Args:
            file_path: Path to the YAML configuration file

        Returns:
            ValidationResult with validation status and any errors/warnings
        """
        file_path = Path(file_path)
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []
        config_name: str | None = None

        # Check file exists
        if not file_path.exists():
            return ValidationResult(
                valid=False,
                errors=[f"File not found: {file_path}"],
                file_path=str(file_path),
            )

        # Parse YAML
        try:
            with open(file_path, encoding="utf-8") as f:
                config_dict = yaml.safe_load(f)
        except yaml.YAMLError as e:
            return ValidationResult(
                valid=False,
                errors=[f"YAML parse error: {e}"],
                file_path=str(file_path),
            )

        if not config_dict:
            return ValidationResult(
                valid=False,
                errors=["Empty configuration file"],
                file_path=str(file_path),
            )

        if not isinstance(config_dict, dict):
            return ValidationResult(
                valid=False,
                errors=[
                    f"Top-level YAML document must be an object, got {type(config_dict).__name__}"
                ],
                file_path=str(file_path),
            )

        config_name = config_dict.get("name", "unknown")

        # Validate structure
        structure_result = self._validate_structure(config_dict)
        errors.extend(structure_result["errors"])
        warnings.extend(structure_result["warnings"])
        actionable_warnings.extend(structure_result["actionable_warnings"])

        # Validate using Pydantic schema
        schema_result = self._validate_schema(config_dict)
        errors.extend(schema_result["errors"])
        warnings.extend(schema_result["warnings"])
        actionable_warnings.extend(schema_result["actionable_warnings"])

        # Validate workflow actions
        action_result = self._validate_actions(config_dict)
        errors.extend(action_result["errors"])
        warnings.extend(action_result["warnings"])
        actionable_warnings.extend(action_result["actionable_warnings"])

        # Validate selector references
        selector_result = self._validate_selectors(config_dict)
        errors.extend(selector_result["errors"])
        warnings.extend(selector_result["warnings"])
        actionable_warnings.extend(selector_result["actionable_warnings"])

        login_result = self._validate_login_config(config_dict)
        errors.extend(login_result["errors"])
        warnings.extend(login_result["warnings"])
        actionable_warnings.extend(login_result["actionable_warnings"])

        # Best practice checks
        bp_result = self._check_best_practices(config_dict)
        warnings.extend(bp_result["warnings"])
        actionable_warnings.extend(bp_result["actionable_warnings"])
        if self.strict:
            errors.extend(warnings)
            errors.extend(actionable_warnings)

        deduped_errors = _dedupe_items(errors)
        deduped_warnings = _dedupe_items(warnings)
        deduped_actionable_warnings = _dedupe_items(actionable_warnings)

        requires_login = self._requires_login(config_dict)
        runtime_credential_refs = self._build_runtime_credential_refs(config_dict)
        selector_names, selector_ids = self._collect_selector_names_and_ids(config_dict)

        return ValidationResult(
            valid=len(deduped_errors) == 0,
            errors=deduped_errors,
            warnings=deduped_warnings,
            actionable_warnings=deduped_actionable_warnings,
            config_name=config_name,
            file_path=str(file_path),
            metadata={
                "requires_login": requires_login,
                "runtime_credential_refs": runtime_credential_refs,
                "selector_names": sorted(selector_names),
                "selector_ids": sorted(selector_ids),
            },
        )

    def validate_dict(self, config_dict: Any) -> ValidationResult:
        """
        Validate a configuration dictionary.

        Args:
            config_dict: Configuration dictionary

        Returns:
            ValidationResult with validation status and any errors/warnings
        """
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        if not isinstance(config_dict, dict):
            return ValidationResult(
                valid=False,
                errors=[
                    f"Top-level YAML document must be an object, got {type(config_dict).__name__}"
                ],
            )

        config_name = config_dict.get("name", "unknown")

        # Validate structure
        structure_result = self._validate_structure(config_dict)
        errors.extend(structure_result["errors"])
        warnings.extend(structure_result["warnings"])
        actionable_warnings.extend(structure_result["actionable_warnings"])

        # Validate using Pydantic schema
        schema_result = self._validate_schema(config_dict)
        errors.extend(schema_result["errors"])
        warnings.extend(schema_result["warnings"])
        actionable_warnings.extend(schema_result["actionable_warnings"])

        # Validate workflow actions
        action_result = self._validate_actions(config_dict)
        errors.extend(action_result["errors"])
        warnings.extend(action_result["warnings"])
        actionable_warnings.extend(action_result["actionable_warnings"])

        # Validate selector references
        selector_result = self._validate_selectors(config_dict)
        errors.extend(selector_result["errors"])
        warnings.extend(selector_result["warnings"])
        actionable_warnings.extend(selector_result["actionable_warnings"])

        login_result = self._validate_login_config(config_dict)
        errors.extend(login_result["errors"])
        warnings.extend(login_result["warnings"])
        actionable_warnings.extend(login_result["actionable_warnings"])

        # Best practice checks
        bp_result = self._check_best_practices(config_dict)
        warnings.extend(bp_result["warnings"])
        actionable_warnings.extend(bp_result["actionable_warnings"])
        if self.strict:
            errors.extend(warnings)
            errors.extend(actionable_warnings)

        deduped_errors = _dedupe_items(errors)
        deduped_warnings = _dedupe_items(warnings)
        deduped_actionable_warnings = _dedupe_items(actionable_warnings)

        requires_login = self._requires_login(config_dict)
        runtime_credential_refs = self._build_runtime_credential_refs(config_dict)
        selector_names, selector_ids = self._collect_selector_names_and_ids(config_dict)

        return ValidationResult(
            valid=len(deduped_errors) == 0,
            errors=deduped_errors,
            warnings=deduped_warnings,
            actionable_warnings=deduped_actionable_warnings,
            config_name=config_name,
            metadata={
                "requires_login": requires_login,
                "runtime_credential_refs": runtime_credential_refs,
                "selector_names": sorted(selector_names),
                "selector_ids": sorted(selector_ids),
            },
        )

    def validate_yaml_string(self, yaml_string: str) -> ValidationResult:
        """
        Validate a YAML string.

        Args:
            yaml_string: YAML configuration as string

        Returns:
            ValidationResult with validation status and any errors/warnings
        """
        try:
            config_dict = yaml.safe_load(yaml_string)
        except yaml.YAMLError as e:
            return ValidationResult(
                valid=False,
                errors=[f"YAML parse error: {e}"],
            )

        if not config_dict:
            return ValidationResult(
                valid=False,
                errors=["Empty configuration"],
            )

        return self.validate_dict(config_dict)

    def _validate_structure(self, config_dict: dict[str, Any]) -> dict[str, list[str]]:
        """Validate basic structure requirements."""
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        # Required top-level fields
        required_fields = ["name", "base_url"]
        for field in required_fields:
            if field not in config_dict:
                errors.append(f"Missing required field: '{field}'")
            elif not config_dict[field]:
                errors.append(f"Required field '{field}' is empty")

        # Workflows should exist (even if empty)
        if "workflows" not in config_dict:
            actionable_warnings.append(
                "No 'workflows' defined - scraper will not perform any actions"
            )
        elif not config_dict["workflows"]:
            actionable_warnings.append(
                "'workflows' is empty - scraper will not perform any actions"
            )

        selectors = config_dict.get("selectors", [])
        if selectors is not None and not isinstance(selectors, list):
            errors.append("'selectors' must be a list of selector objects")

        workflows = config_dict.get("workflows", [])
        if workflows is not None and not isinstance(workflows, list):
            errors.append("'workflows' must be a list of workflow steps")

        return {
            "errors": errors,
            "warnings": warnings,
            "actionable_warnings": actionable_warnings,
        }

    def _validate_schema(self, config_dict: dict[str, Any]) -> dict[str, list[str]]:
        """Validate against Pydantic schema."""
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        try:
            from core.anti_detection_manager import AntiDetectionConfig
            from scrapers.models import ScraperConfig

            # Preprocess anti_detection if present
            config_copy = config_dict.copy()
            if "anti_detection" in config_copy and isinstance(
                config_copy["anti_detection"], dict
            ):
                config_copy["anti_detection"] = AntiDetectionConfig(
                    **config_copy["anti_detection"]
                )

            # Remove empty login if present
            if "login" in config_copy and not config_copy["login"]:
                del config_copy["login"]

            # Validate
            ScraperConfig(**config_copy)

        except ImportError as e:
            warnings.append(f"Could not import schema models for validation: {e}")
        except Exception as e:
            error_msg = str(e)
            # Parse Pydantic validation errors for better messages
            if "validation error" in error_msg.lower():
                # Extract field-specific errors
                for line in error_msg.split("\n"):
                    line = line.strip()
                    if line and not line.startswith("For further"):
                        errors.append(f"Schema error: {line}")
            else:
                errors.append(f"Schema validation failed: {error_msg}")

        return {
            "errors": errors,
            "warnings": warnings,
            "actionable_warnings": actionable_warnings,
        }

    def _validate_actions(self, config_dict: dict[str, Any]) -> dict[str, list[str]]:
        """Validate workflow action names."""
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        workflows = config_dict.get("workflows", [])
        if not workflows:
            return {
                "errors": errors,
                "warnings": warnings,
                "actionable_warnings": actionable_warnings,
            }

        registered_actions = self._get_registered_actions()

        for i, step in enumerate(workflows, 1):
            if not isinstance(step, dict):
                errors.append(
                    f"Step {i}: Invalid step format (expected dict, got {type(step).__name__})"
                )
                continue

            action = step.get("action")
            if not action:
                errors.append(f"Step {i}: Missing 'action' field")
                continue

            action_lower = action.lower()
            if (
                action_lower not in registered_actions
                and action_lower not in self.KNOWN_ACTIONS
            ):
                errors.append(f"Step {i}: Unknown action '{action}'")

            # Validate action-specific params
            params = step.get("params", {})
            if params is None:
                params = {}
            if not isinstance(params, dict):
                errors.append(
                    f"Step {i}: 'params' must be an object when provided"
                )
                continue
            action_errors = self._validate_action_params(action_lower, params, i)
            errors.extend(action_errors)

            if action_lower == "login" and not isinstance(config_dict.get("login"), dict):
                actionable_warnings.append(
                    f"Step {i}: login action exists but login config is missing. Add a top-level 'login' block so local validation can test selectors and failures clearly."
                )

        return {
            "errors": errors,
            "warnings": warnings,
            "actionable_warnings": actionable_warnings,
        }

    def _validate_action_params(
        self, action: str, params: dict[str, Any], step_num: int
    ) -> list[str]:
        """Validate action-specific parameters."""
        errors: list[str] = []

        # Action-specific parameter requirements
        if action == "navigate":
            if "url" not in params:
                errors.append(
                    f"Step {step_num}: 'navigate' action requires 'url' parameter"
                )

        elif action == "click":
            if "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'click' action requires 'selector' parameter"
                )

        elif action == "wait_for":
            if "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'wait_for' action requires 'selector' parameter"
                )

        elif action == "input_text":
            if "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'input_text' action requires 'selector' parameter"
                )
            if "text" not in params and "value" not in params:
                errors.append(
                    f"Step {step_num}: 'input_text' action requires 'text' or 'value' parameter"
                )

        elif action == "conditional_skip":
            if "if_flag" not in params:
                errors.append(
                    f"Step {step_num}: 'conditional_skip' action requires 'if_flag' parameter"
                )

        elif action == "extract":
            if "fields" not in params:
                errors.append(
                    f"Step {step_num}: 'extract' action requires 'fields' parameter"
                )

        elif action == "verify":
            if "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'verify' action requires 'selector' parameter"
                )
            if "expected_value" not in params:
                errors.append(
                    f"Step {step_num}: 'verify' action requires 'expected_value' parameter"
                )

        elif action == "verify_value":
            if "field" not in params:
                errors.append(
                    f"Step {step_num}: 'verify_value' action requires 'field' parameter"
                )

        elif action == "combine_fields":
            if "target_field" not in params:
                errors.append(
                    f"Step {step_num}: 'combine_fields' action requires 'target_field' parameter"
                )
            if "format" not in params:
                errors.append(
                    f"Step {step_num}: 'combine_fields' action requires 'format' parameter"
                )

        elif action == "extract_single":
            if "field" not in params:
                errors.append(
                    f"Step {step_num}: 'extract_single' action requires 'field' parameter"
                )
            if "selector_id" not in params and "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'extract_single' action requires 'selector_id' or 'selector' parameter"
                )

        elif action == "extract_multiple":
            if "field" not in params:
                errors.append(
                    f"Step {step_num}: 'extract_multiple' action requires 'field' parameter"
                )
            if "selector_id" not in params and "selector" not in params:
                errors.append(
                    f"Step {step_num}: 'extract_multiple' action requires 'selector_id' or 'selector' parameter"
                )

        elif action == "extract_and_transform":
            fields = params.get("fields")
            if not isinstance(fields, list) or not fields:
                errors.append(
                    f"Step {step_num}: 'extract_and_transform' action requires a non-empty 'fields' list"
                )
            else:
                for field_index, field in enumerate(fields, start=1):
                    if not isinstance(field, dict):
                        errors.append(
                            f"Step {step_num} field {field_index}: expected object, got {type(field).__name__}"
                        )
                        continue
                    if not field.get("name"):
                        errors.append(
                            f"Step {step_num} field {field_index}: missing 'name'"
                        )
                    if not field.get("selector"):
                        errors.append(
                            f"Step {step_num} field {field_index}: missing 'selector'"
                        )

        elif action == "set_proxy":
            proxy_payload = params.get("proxy")
            if proxy_payload is not None and not isinstance(proxy_payload, dict):
                errors.append(
                    f"Step {step_num}: 'set_proxy' action expects 'proxy' to be an object when provided"
                )

        return errors

    def _validate_selectors(self, config_dict: dict[str, Any]) -> dict[str, list[str]]:
        """Validate selector definitions and references."""
        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        selectors = config_dict.get("selectors", [])
        if not isinstance(selectors, list):
            return {
                "errors": errors,
                "warnings": warnings,
                "actionable_warnings": actionable_warnings,
            }
        selector_names: set[str] = set()
        selector_ids: set[str] = set()

        # Build selector lookup
        for i, sel in enumerate(selectors):
            if not isinstance(sel, dict):
                errors.append(f"Selector {i + 1}: Invalid format (expected dict)")
                continue

            name = sel.get("name")
            if not name:
                errors.append(f"Selector {i + 1}: Missing 'name' field")
            else:
                if name in selector_names:
                    warnings.append(f"Duplicate selector name: '{name}'")
                selector_names.add(name)

            sel_id = sel.get("id")
            if sel_id:
                if sel_id in selector_ids:
                    errors.append(f"Duplicate selector ID: '{sel_id}'")
                selector_ids.add(sel_id)

            if "selector" not in sel:
                errors.append(f"Selector '{name or i + 1}': Missing 'selector' field")
            else:
                raw_selector = sel.get("selector")
                if not isinstance(raw_selector, str) or not raw_selector.strip():
                    errors.append(
                        f"Selector '{name or i + 1}': 'selector' must be a non-empty string"
                    )

            fallback_selectors = sel.get("fallback_selectors", [])
            if fallback_selectors is not None and not isinstance(fallback_selectors, list):
                errors.append(
                    f"Selector '{name or i + 1}': 'fallback_selectors' must be a list"
                )

        # Check extract action references
        workflows = config_dict.get("workflows", [])
        if not isinstance(workflows, list):
            return {
                "errors": errors,
                "warnings": warnings,
                "actionable_warnings": actionable_warnings,
            }
        for i, step in enumerate(workflows, 1):
            if not isinstance(step, dict):
                continue

            action = step.get("action", "").lower()
            params = step.get("params", {})
            if not isinstance(params, dict):
                continue

            if action == "extract":
                fields = params.get("fields", [])
                for field in fields:
                    if isinstance(field, str):
                        if field not in selector_names and field not in selector_ids:
                            actionable_warnings.append(
                                f"Step {i}: 'extract' references undefined selector '{field}'"
                            )

            if action in {"extract_single", "extract_multiple"}:
                identifier = params.get("selector_id") or params.get("selector")
                if isinstance(identifier, str) and identifier not in selector_names and identifier not in selector_ids:
                    actionable_warnings.append(
                        f"Step {i}: '{action}' references undefined selector '{identifier}'"
                    )

            if action in INLINE_SELECTOR_ACTIONS:
                selector_value = params.get("selector")
                if isinstance(selector_value, str) and selector_value in selector_names:
                    actionable_warnings.append(
                        f"Step {i}: action '{action}' uses selector name '{selector_value}' as a raw selector. Use the actual CSS/XPath selector string or switch to an action that resolves selector references."
                    )

        return {
            "errors": errors,
            "warnings": warnings,
            "actionable_warnings": actionable_warnings,
        }

    def _validate_login_config(self, config_dict: dict[str, Any]) -> dict[str, list[str]]:
        """Validate login-specific config readiness for local testing."""

        errors: list[str] = []
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        if not self._requires_login(config_dict):
            return {
                "errors": errors,
                "warnings": warnings,
                "actionable_warnings": actionable_warnings,
            }

        login_config = config_dict.get("login")
        if not isinstance(login_config, dict):
            errors.append(
                "Config requires login but has no valid top-level 'login' block. Add login.url, username_field, password_field, and submit_button so local debugging can validate the flow."
            )
            return {
                "errors": errors,
                "warnings": warnings,
                "actionable_warnings": actionable_warnings,
            }

        required_fields = ["url", "username_field", "password_field", "submit_button"]
        for field in required_fields:
            value = login_config.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"Login config missing required field '{field}'")

        selector_names, _ = self._collect_selector_names_and_ids(config_dict)
        login_selector_map = _extract_login_selector_map(login_config)
        for selector_name, selector_value in login_selector_map.items():
            if selector_value in selector_names:
                actionable_warnings.append(
                    f"Login field '{selector_name}' points to selector name '{selector_value}' instead of a raw selector string. Login actions do not resolve selector references automatically."
                )

        runtime_credential_refs = self._build_runtime_credential_refs(config_dict)
        explicit_refs = [
            _normalize_credential_ref(value)
            for value in config_dict.get("credential_refs", []) or []
            if _normalize_credential_ref(value)
        ]
        if not explicit_refs:
            actionable_warnings.append(
                "Login-enabled config is relying on implicit scraper-slug credential fallback. Add explicit 'credential_refs' so local validation and runtime diagnostics can report credential lookup failures clearly."
            )

        if not runtime_credential_refs:
            errors.append(
                "Login-enabled config does not expose any runtime credential candidate. Add 'credential_refs' or ensure the scraper 'name' can map to env credentials."
            )

        if login_config.get("failure_indicators") is None:
            actionable_warnings.append(
                "Login config has no 'failure_indicators'. Add auth failure selectors/text patterns so failed login scrapes report explicit reasons instead of generic timeouts."
            )

        return {
            "errors": errors,
            "warnings": warnings,
            "actionable_warnings": actionable_warnings,
        }

    def _check_best_practices(
        self, config_dict: dict[str, Any]
    ) -> dict[str, list[str]]:
        """Check for best practices and common issues."""
        warnings: list[str] = []
        actionable_warnings: list[str] = []

        # Check for test_skus
        if "test_skus" not in config_dict:
            actionable_warnings.append(
                "No 'test_skus' defined - local runtime testing will require --sku every time"
            )

        # Check for validation section
        if "validation" not in config_dict:
            actionable_warnings.append(
                "No 'validation' section - consider adding no_results detection"
            )

        # Check timeout
        timeout = config_dict.get("timeout", 30)
        if timeout < 5:
            warnings.append(f"Timeout of {timeout}s may be too short for some sites")
        elif timeout > 120:
            warnings.append(
                f"Timeout of {timeout}s is very long - may cause slow failures"
            )

        # Check retries
        retries = config_dict.get("retries", 3)
        if retries < 1:
            warnings.append("No retries configured - failures will not be retried")
        elif retries > 10:
            warnings.append(
                f"High retry count ({retries}) may cause very long execution times"
            )

        # Check for wait_for after navigate
        workflows = config_dict.get("workflows", [])
        for i, step in enumerate(workflows):
            if not isinstance(step, dict):
                continue

            action = step.get("action", "").lower()
            if action == "navigate" and i + 1 < len(workflows):
                next_step = workflows[i + 1]
                if isinstance(next_step, dict):
                    next_action = next_step.get("action", "").lower()
                    if next_action not in ["wait", "wait_for"]:
                        actionable_warnings.append(
                            f"Step {i + 1}: 'navigate' not followed by wait - page may not be loaded"
                        )

        if self._requires_login(config_dict):
            fake_skus = config_dict.get("fake_skus") or []
            if not fake_skus:
                actionable_warnings.append(
                    "Login-enabled config has no 'fake_skus'. Add at least one fake SKU so local testing can validate post-login no-results handling."
                )

        return {"errors": [], "warnings": warnings, "actionable_warnings": actionable_warnings}

    def _collect_selector_names_and_ids(
        self, config_dict: dict[str, Any]
    ) -> tuple[set[str], set[str]]:
        selector_names: set[str] = set()
        selector_ids: set[str] = set()
        selectors = config_dict.get("selectors", [])
        if not isinstance(selectors, list):
            return selector_names, selector_ids

        for selector in selectors:
            if not isinstance(selector, dict):
                continue
            name = selector.get("name")
            if isinstance(name, str) and name.strip():
                selector_names.add(name.strip())
            selector_id = selector.get("id")
            if isinstance(selector_id, str) and selector_id.strip():
                selector_ids.add(selector_id.strip())
        return selector_names, selector_ids

    def _requires_login(self, config_dict: dict[str, Any]) -> bool:
        login_config = config_dict.get("login")
        if isinstance(login_config, dict) and login_config:
            return True

        workflows = config_dict.get("workflows", [])
        if not isinstance(workflows, list):
            return False

        for step in workflows:
            if not isinstance(step, dict):
                continue
            action = str(step.get("action") or "").strip().lower()
            if action == "login":
                return True

        return False

    def _build_runtime_credential_refs(self, config_dict: dict[str, Any]) -> list[str]:
        refs: list[str] = []

        name = _normalize_credential_ref(config_dict.get("name"))
        if name:
            refs.append(name)

        explicit_refs = config_dict.get("credential_refs", []) or []
        if isinstance(explicit_refs, list):
            refs.extend(
                ref
                for ref in (_normalize_credential_ref(value) for value in explicit_refs)
                if ref
            )

        return _dedupe_items(refs)


def validate_config_file(
    file_path: str | Path, strict: bool = False
) -> ValidationResult:
    """
    Convenience function to validate a config file.

    Args:
        file_path: Path to YAML config file
        strict: Treat warnings as errors

    Returns:
        ValidationResult
    """
    validator = ConfigValidator(strict=strict)
    return validator.validate_file(file_path)


def validate_all_configs(
    configs_dir: str | Path, strict: bool = False
) -> dict[str, ValidationResult]:
    """
    Validate all YAML configs in a directory.

    Args:
        configs_dir: Directory containing YAML config files
        strict: Treat warnings as errors

    Returns:
        Dict mapping filename to ValidationResult
    """
    configs_dir = Path(configs_dir)
    results: dict[str, ValidationResult] = {}
    validator = ConfigValidator(strict=strict)

    for yaml_file in configs_dir.glob("*.yaml"):
        results[yaml_file.name] = validator.validate_file(yaml_file)

    return results
