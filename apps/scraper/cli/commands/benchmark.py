"""Benchmark commands for crawl4ai extraction modes.

.. deprecated::
    Use ``cli.commands.benchmark_unified`` instead. This module will be removed
    in a future release. The unified CLI provides subcommands (run, report,
    compare, validate-urls) with cost estimation, progress output, and
    integration with the unified config/reporter/metrics modules.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import statistics
import time
from collections import Counter
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import click
from crawl4ai import LLMConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy, LLMExtractionStrategy

from scrapers.ai_cost_tracker import AICostTracker, MAX_COST_PER_PAGE
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor, _resolve_grounding_images
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer
from scrapers.schemas.product import ProductData
from scrapers.utils.ai_utils import (
    build_extraction_instruction,
    extract_product_from_meta_tags,
    get_scroll_javascript,
)
from src.crawl4ai_engine.engine import Crawl4AIEngine

SUPPORTED_MODES = ("llm-free", "llm", "auto")
AUTO_ACCEPTANCE_THRESHOLD = 0.8
DEFAULT_PROMPT_VERSION = "v1"
DEFAULT_HEADLESS = True
DEFAULT_OUTPUT_DIR = Path(".sisyphus") / "evidence"
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
LIST_FIELDS = {"images", "categories"}
BENCHMARK_FIELDS = (
    "product_name",
    "brand",
    "description",
    "size_metrics",
    "images",
    "categories",
)


@dataclass(frozen=True)
class BenchmarkLLMConfig:
    """Runtime configuration for the benchmark LLM mode."""

    provider: str
    model: str
    api_key: str | None = None
    base_url: str | None = None

    @property
    def crawl4ai_provider(self) -> str:
        if self.provider == "gemini":
            return f"gemini/{self.model}"
        return f"openai/{self.model}"

    @property
    def ready(self) -> bool:
        if self.provider == "openai_compatible":
            return bool(self.base_url)
        return bool(self.api_key)


@dataclass(frozen=True)
class BenchmarkProduct:
    """Normalized benchmark input product."""

    sku: str
    url: str
    product_name: str | None = None
    brand: str | None = None
    category: str | None = None
    expected: dict[str, Any] = field(default_factory=dict)

    @property
    def label(self) -> str:
        if self.sku:
            return self.sku
        if self.product_name:
            return self.product_name
        return self.url


@dataclass
class BenchmarkAttempt:
    """Single benchmark run result."""

    mode_requested: str
    mode_used: str
    sku: str
    url: str
    iteration: int
    success: bool
    duration_ms: float
    cost_usd: float
    accuracy: float | None
    confidence: float | None
    field_scores: dict[str, float] = field(default_factory=dict)
    error: str | None = None
    notes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode_requested": self.mode_requested,
            "mode_used": self.mode_used,
            "sku": self.sku,
            "url": self.url,
            "iteration": self.iteration,
            "success": self.success,
            "duration_ms": round(self.duration_ms, 2),
            "cost_usd": round(self.cost_usd, 6),
            "accuracy": None if self.accuracy is None else round(self.accuracy, 4),
            "confidence": None if self.confidence is None else round(self.confidence, 4),
            "field_scores": {key: round(value, 4) for key, value in self.field_scores.items()},
            "error": self.error,
            "notes": self.notes,
        }


def _normalize_optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_expected(payload: dict[str, Any]) -> dict[str, Any]:
    expected_payload = payload.get("expected")
    expected = expected_payload if isinstance(expected_payload, dict) else {}
    normalized: dict[str, Any] = {}

    def _pick(*keys: str) -> Any:
        for key in keys:
            if key in expected and expected[key] not in (None, ""):
                return expected[key]
            if key in payload and payload[key] not in (None, ""):
                return payload[key]
        return None

    normalized["product_name"] = _pick("product_name", "name")
    normalized["brand"] = _pick("brand")
    normalized["description"] = _pick("description")
    normalized["size_metrics"] = _pick("size_metrics")
    normalized["images"] = _pick("images")
    normalized["categories"] = _pick("categories")

    return {key: value for key, value in normalized.items() if value not in (None, "", [])}


def _resolve_product_url(payload: dict[str, Any]) -> str | None:
    for key in ("url", "product_url", "page_url", "source_url"):
        value = _normalize_optional_string(payload.get(key))
        if value:
            return value

    images = payload.get("images")
    if isinstance(images, list):
        for candidate in images:
            value = _normalize_optional_string(candidate)
            if value and value.startswith(("http://", "https://", "file://")):
                return value

    return None


def _load_products(products_path: Path) -> list[BenchmarkProduct]:
    with products_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, list):
        raise click.ClickException("Products file must contain a JSON array")

    products: list[BenchmarkProduct] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise click.ClickException(f"Product entry {index} must be a JSON object")

        url = _resolve_product_url(item)
        if not url:
            raise click.ClickException(f"Product entry {index} is missing a benchmark URL. Provide url/product_url/page_url/source_url.")

        expected = _normalize_expected(item)
        products.append(
            BenchmarkProduct(
                sku=_normalize_optional_string(item.get("sku")) or f"product-{index}",
                url=url,
                product_name=_normalize_optional_string(expected.get("product_name")),
                brand=_normalize_optional_string(expected.get("brand")),
                category=(expected["categories"][0] if isinstance(expected.get("categories"), list) and expected["categories"] else None),
                expected=expected,
            )
        )

    return products


def _resolve_benchmark_modes(requested_mode: str) -> tuple[str, ...]:
    normalized_mode = requested_mode.strip().lower()
    if normalized_mode == "auto":
        return SUPPORTED_MODES
    return (normalized_mode,)


def _resolve_llm_config(provider: str, model: str | None) -> BenchmarkLLMConfig:
    normalized_provider = provider.strip().lower()
    if normalized_provider == "auto":
        if os.getenv("OPENAI_API_KEY"):
            normalized_provider = "openai"
        elif os.getenv("GEMINI_API_KEY"):
            normalized_provider = "gemini"
        elif os.getenv("OPENAI_COMPATIBLE_BASE_URL"):
            normalized_provider = "openai_compatible"
        else:
            normalized_provider = "gemini"

    if normalized_provider == "openai":
        return BenchmarkLLMConfig(
            provider="openai",
            model=_normalize_optional_string(model) or "gpt-4o-mini",
            api_key=_normalize_optional_string(os.getenv("OPENAI_API_KEY")),
        )

    if normalized_provider == "openai_compatible":
        return BenchmarkLLMConfig(
            provider="openai_compatible",
            model=_normalize_optional_string(model) or "google/gemma-3-12b-it",
            api_key=_normalize_optional_string(os.getenv("OPENAI_COMPATIBLE_API_KEY")) or "baystate-local",
            base_url=_normalize_optional_string(os.getenv("OPENAI_COMPATIBLE_BASE_URL")),
        )

    return BenchmarkLLMConfig(
        provider="gemini",
        model=_normalize_optional_string(model) or "gemini-2.5-flash",
        api_key=_normalize_optional_string(os.getenv("GEMINI_API_KEY")),
    )


def _requires_llm(modes: tuple[str, ...]) -> bool:
    return any(mode in {"llm", "auto"} for mode in modes)


def _projected_cost_usd(product_count: int, iterations: int, modes: tuple[str, ...]) -> float:
    llm_mode_count = sum(1 for mode in modes if mode in {"llm", "auto"})
    return float(product_count * iterations * llm_mode_count * MAX_COST_PER_PAGE)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _tokenize(value: Any) -> list[str]:
    return TOKEN_PATTERN.findall(_normalize_text(value))


def _token_similarity(expected: Any, actual: Any) -> float:
    expected_tokens = _tokenize(expected)
    actual_tokens = _tokenize(actual)
    if not expected_tokens and not actual_tokens:
        return 1.0
    if not expected_tokens or not actual_tokens:
        return 0.0

    expected_counter = Counter(expected_tokens)
    actual_counter = Counter(actual_tokens)
    overlap = sum((expected_counter & actual_counter).values())
    denominator = len(expected_tokens) + len(actual_tokens)
    f1_score = (2.0 * overlap) / denominator if denominator else 0.0

    expected_text = " ".join(expected_tokens)
    actual_text = " ".join(actual_tokens)
    ratio = SequenceMatcher(None, expected_text, actual_text).ratio()
    return max(f1_score, ratio)


def _list_similarity(expected: Any, actual: Any) -> float:
    expected_set = {_normalize_text(item) for item in expected or [] if _normalize_text(item)}
    actual_set = {_normalize_text(item) for item in actual or [] if _normalize_text(item)}
    if not expected_set and not actual_set:
        return 1.0
    if not expected_set or not actual_set:
        return 0.0
    return len(expected_set & actual_set) / len(expected_set | actual_set)


def _compare_field(field_name: str, expected: Any, actual: Any) -> float:
    if field_name in LIST_FIELDS:
        return _list_similarity(expected, actual)

    if field_name == "brand":
        expected_text = _normalize_text(expected)
        actual_text = _normalize_text(actual)
        if not expected_text and not actual_text:
            return 1.0
        if not expected_text or not actual_text:
            return 0.0
        if expected_text == actual_text:
            return 1.0
        if expected_text in actual_text or actual_text in expected_text:
            return 0.9

    return _token_similarity(expected, actual)


def _score_extraction(product: BenchmarkProduct, extracted: dict[str, Any]) -> tuple[float | None, dict[str, float]]:
    if not product.expected:
        return None, {}

    field_scores: dict[str, float] = {}
    for field_name, expected_value in product.expected.items():
        if field_name not in BENCHMARK_FIELDS:
            continue
        field_scores[field_name] = _compare_field(field_name, expected_value, extracted.get(field_name))

    if not field_scores:
        return None, {}

    return statistics.fmean(field_scores.values()), field_scores


def _estimate_tokens(text: str, *, minimum: int, maximum: int) -> int:
    estimated = max(minimum, round(len(text) / 4)) if text else minimum
    return min(estimated, maximum)


def _estimate_llm_cost(model: str, input_text: str, output_payload: Any) -> float:
    tracker = AICostTracker()
    input_tokens = _estimate_tokens(input_text, minimum=600, maximum=4000)
    output_text = json.dumps(output_payload, sort_keys=True) if output_payload is not None else "{}"
    output_tokens = _estimate_tokens(output_text, minimum=150, maximum=1200)
    return tracker.calculate_cost(model=model, input_tokens=input_tokens, output_tokens=output_tokens)


def _extract_content_strings(result: dict[str, Any]) -> tuple[str, str]:
    html_value = result.get("html")
    fit_markdown_value = result.get("fit_markdown")
    raw_markdown_value = result.get("raw_markdown")
    markdown_value = result.get("markdown")

    html = html_value if isinstance(html_value, str) else ""
    fit_markdown = fit_markdown_value if isinstance(fit_markdown_value, str) else ""
    raw_markdown = raw_markdown_value if isinstance(raw_markdown_value, str) else ""
    markdown = markdown_value if isinstance(markdown_value, str) else ""
    return html, fit_markdown or raw_markdown or markdown


def _parse_extracted_content(extracted_content: Any) -> list[dict[str, Any]]:
    if isinstance(extracted_content, str):
        parsed = json.loads(extracted_content)
    else:
        parsed = extracted_content

    if isinstance(parsed, dict):
        return [parsed]

    if isinstance(parsed, list):
        records = [item for item in parsed if isinstance(item, dict)]
        if records:
            return records

    raise TypeError("Structured extraction result must be a dict, list, or JSON string")


def _build_engine_config(*, headless: bool, extraction_strategy: object | None = None) -> dict[str, Any]:
    return {
        "browser": {
            "headless": headless,
            "viewport": {"width": 1920, "height": 1080},
        },
        "crawler": {
            "magic": True,
            "simulate_user": True,
            "remove_overlay_elements": True,
            "cache_mode": "BYPASS",
            "js_code": get_scroll_javascript(),
            "timeout": 30000,
            "pruning_enabled": True,
            "wait_until": "networkidle",
            "extraction_strategy": extraction_strategy,
        },
    }


async def _crawl_with_relaxed_wait(engine: Crawl4AIEngine, url: str) -> dict[str, Any]:
    result = await engine.crawl(url)
    if not result.get("success") and Crawl4AIExtractor._should_retry_with_relaxed_wait(result):
        engine.config.setdefault("crawler", {})["wait_until"] = "domcontentloaded"
        result = await engine.crawl(url)
    return result


def _build_extractor(llm_config: BenchmarkLLMConfig) -> Crawl4AIExtractor:
    return Crawl4AIExtractor(
        headless=DEFAULT_HEADLESS,
        llm_model=llm_config.model,
        llm_provider="gemini" if llm_config.provider == "gemini" else "openai_compatible",
        llm_base_url=llm_config.base_url,
        llm_api_key=llm_config.api_key,
        scoring=SearchScorer(),
        matching=MatchingUtils(),
        cache_enabled=False,
        extraction_strategy="json_css",
        prompt_version=DEFAULT_PROMPT_VERSION,
    )


async def _normalize_structured_payload(
    *,
    extractor: Crawl4AIExtractor,
    raw_payload: dict[str, Any],
    product: BenchmarkProduct,
    html: str,
) -> dict[str, Any]:
    normalized = extractor._normalize_llm_product_data(
        raw_payload,
        url=product.url,
        html=html,
        expected_name=product.product_name,
        expected_brand=product.brand,
    )
    normalized["images"] = await _resolve_grounding_images(
        extractor._grounding_redirect_resolver,
        extractor._extraction.coerce_string_list(normalized.get("images")),
    )
    normalized["success"] = True
    normalized["url"] = product.url
    filled = sum(1 for field_name in BENCHMARK_FIELDS if normalized.get(field_name))
    normalized["confidence"] = filled / len(BENCHMARK_FIELDS)
    return normalized


def _build_attempt(
    *,
    product: BenchmarkProduct,
    iteration: int,
    mode_requested: str,
    mode_used: str,
    success: bool,
    duration_ms: float,
    cost_usd: float,
    extracted: dict[str, Any] | None = None,
    error: str | None = None,
    notes: dict[str, Any] | None = None,
) -> BenchmarkAttempt:
    payload = extracted or {}
    accuracy, field_scores = _score_extraction(product, payload)
    confidence = payload.get("confidence") if isinstance(payload.get("confidence"), (int, float)) else None
    return BenchmarkAttempt(
        mode_requested=mode_requested,
        mode_used=mode_used,
        sku=product.sku,
        url=product.url,
        iteration=iteration,
        success=success,
        duration_ms=duration_ms,
        cost_usd=cost_usd,
        accuracy=accuracy,
        confidence=float(confidence) if confidence is not None else None,
        field_scores=field_scores,
        error=error,
        notes=notes or {},
    )


async def _run_llm_free_mode(
    product: BenchmarkProduct,
    llm_config: BenchmarkLLMConfig,
    *,
    iteration: int,
    headless: bool,
    prompt_version: str,
) -> BenchmarkAttempt:
    _ = prompt_version
    extractor = _build_extractor(llm_config)
    start = time.perf_counter()

    async with Crawl4AIEngine(_build_engine_config(headless=headless)) as engine:
        fetch_result = await _crawl_with_relaxed_wait(engine, product.url)
        html, markdown = _extract_content_strings(fetch_result)

        if fetch_result.get("success") and (html or markdown):
            jsonld_result = extractor._extraction.extract_product_from_html_jsonld(
                html_text=html or markdown,
                source_url=product.url,
                sku=product.sku,
                product_name=product.product_name,
                brand=product.brand,
                matching_utils=extractor._matching,
            )
            if jsonld_result:
                jsonld_result["url"] = product.url
                jsonld_result["images"] = await _resolve_grounding_images(
                    extractor._grounding_redirect_resolver,
                    extractor._extraction.coerce_string_list(jsonld_result.get("images")),
                )
                jsonld_result["confidence"] = max(float(jsonld_result.get("confidence", 0.0)), 0.8)
                duration_ms = (time.perf_counter() - start) * 1000
                return _build_attempt(
                    product=product,
                    iteration=iteration,
                    mode_requested="llm-free",
                    mode_used="json-ld",
                    success=True,
                    duration_ms=duration_ms,
                    cost_usd=0.0,
                    extracted=jsonld_result,
                )

            meta_result = extract_product_from_meta_tags(
                extraction_utils=extractor._extraction,
                matching_utils=extractor._matching,
                html_text=html or markdown,
                source_url=product.url,
                product_name=product.product_name,
                brand=product.brand,
            )
            if meta_result:
                meta_result["url"] = product.url
                meta_result["images"] = await _resolve_grounding_images(
                    extractor._grounding_redirect_resolver,
                    extractor._extraction.coerce_string_list(meta_result.get("images")),
                )
                duration_ms = (time.perf_counter() - start) * 1000
                return _build_attempt(
                    product=product,
                    iteration=iteration,
                    mode_requested="llm-free",
                    mode_used="meta-tags",
                    success=True,
                    duration_ms=duration_ms,
                    cost_usd=0.0,
                    extracted=meta_result,
                )

        if not fetch_result.get("success"):
            duration_ms = (time.perf_counter() - start) * 1000
            return _build_attempt(
                product=product,
                iteration=iteration,
                mode_requested="llm-free",
                mode_used="crawl",
                success=False,
                duration_ms=duration_ms,
                cost_usd=0.0,
                error=str(fetch_result.get("error") or "Fetch failed"),
            )

        strategy = JsonCssExtractionStrategy(schema=extractor._product_schema)
        engine.config.setdefault("crawler", {})["extraction_strategy"] = strategy
        engine.config["crawler"]["cache_mode"] = "BYPASS"
        structured_result = await _crawl_with_relaxed_wait(engine, product.url)

    duration_ms = (time.perf_counter() - start) * 1000
    html, _ = _extract_content_strings(structured_result)
    extracted_content = structured_result.get("extracted_content")
    if structured_result.get("success") and extracted_content:
        try:
            records = _parse_extracted_content(extracted_content)
            payload = await _normalize_structured_payload(
                extractor=extractor,
                raw_payload=records[0],
                product=product,
                html=html,
            )
            return _build_attempt(
                product=product,
                iteration=iteration,
                mode_requested="llm-free",
                mode_used="json-css",
                success=True,
                duration_ms=duration_ms,
                cost_usd=0.0,
                extracted=payload,
            )
        except (json.JSONDecodeError, TypeError, IndexError) as exc:
            return _build_attempt(
                product=product,
                iteration=iteration,
                mode_requested="llm-free",
                mode_used="json-css",
                success=False,
                duration_ms=duration_ms,
                cost_usd=0.0,
                error=f"Could not parse llm-free extraction: {exc}",
            )

    return _build_attempt(
        product=product,
        iteration=iteration,
        mode_requested="llm-free",
        mode_used="json-css",
        success=False,
        duration_ms=duration_ms,
        cost_usd=0.0,
        error=str(structured_result.get("error") or "No structured content returned"),
    )


async def _run_llm_mode(
    product: BenchmarkProduct,
    llm_config: BenchmarkLLMConfig,
    *,
    iteration: int,
    headless: bool,
    prompt_version: str,
) -> BenchmarkAttempt:
    if not llm_config.ready:
        missing_detail = "base URL" if llm_config.provider == "openai_compatible" else "API key"
        raise click.ClickException(f"LLM benchmark mode requires a configured {missing_detail}")

    extractor = _build_extractor(llm_config)
    instruction = build_extraction_instruction(
        product.sku,
        product.brand,
        product.product_name,
        prompt_version,
    )
    strategy = LLMExtractionStrategy(
        llm_config=LLMConfig(
            provider=llm_config.crawl4ai_provider,
            api_token=llm_config.api_key,
            base_url=llm_config.base_url,
        ),
        schema=ProductData.model_json_schema(),
        extraction_type="schema",
        instruction=instruction,
        input_format="fit_markdown",
        chunk_token_threshold=4000,
        overlap_rate=0.1,
    )

    start = time.perf_counter()
    async with Crawl4AIEngine(_build_engine_config(headless=headless, extraction_strategy=strategy)) as engine:
        result = await _crawl_with_relaxed_wait(engine, product.url)

    duration_ms = (time.perf_counter() - start) * 1000
    html, markdown = _extract_content_strings(result)
    input_text = markdown or html
    extracted_content = result.get("extracted_content")

    if result.get("success") and extracted_content:
        try:
            records = _parse_extracted_content(extracted_content)
            payload = await _normalize_structured_payload(
                extractor=extractor,
                raw_payload=records[0],
                product=product,
                html=html,
            )
            cost_usd = _estimate_llm_cost(llm_config.model, input_text, payload)
            return _build_attempt(
                product=product,
                iteration=iteration,
                mode_requested="llm",
                mode_used="llm",
                success=True,
                duration_ms=duration_ms,
                cost_usd=cost_usd,
                extracted=payload,
            )
        except (json.JSONDecodeError, TypeError, IndexError) as exc:
            cost_usd = _estimate_llm_cost(llm_config.model, input_text, extracted_content)
            return _build_attempt(
                product=product,
                iteration=iteration,
                mode_requested="llm",
                mode_used="llm",
                success=False,
                duration_ms=duration_ms,
                cost_usd=cost_usd,
                error=f"Could not parse llm extraction: {exc}",
            )

    cost_usd = _estimate_llm_cost(llm_config.model, input_text, extracted_content or {"error": result.get("error")})
    return _build_attempt(
        product=product,
        iteration=iteration,
        mode_requested="llm",
        mode_used="llm",
        success=False,
        duration_ms=duration_ms,
        cost_usd=cost_usd,
        error=str(result.get("error") or "No llm extraction content returned"),
    )


def _attempt_score(attempt: BenchmarkAttempt) -> float:
    if attempt.accuracy is not None:
        return attempt.accuracy
    if attempt.confidence is not None:
        return attempt.confidence
    return 1.0 if attempt.success else 0.0


async def _run_auto_mode(
    product: BenchmarkProduct,
    llm_config: BenchmarkLLMConfig,
    *,
    iteration: int,
    headless: bool,
    prompt_version: str,
) -> BenchmarkAttempt:
    llm_free_attempt = await _run_llm_free_mode(
        product,
        llm_config,
        iteration=iteration,
        headless=headless,
        prompt_version=prompt_version,
    )
    llm_free_score = _attempt_score(llm_free_attempt)
    fallback_needed = (not llm_free_attempt.success) or llm_free_score < AUTO_ACCEPTANCE_THRESHOLD

    if not fallback_needed:
        return BenchmarkAttempt(
            mode_requested="auto",
            mode_used=llm_free_attempt.mode_used,
            sku=product.sku,
            url=product.url,
            iteration=iteration,
            success=llm_free_attempt.success,
            duration_ms=llm_free_attempt.duration_ms,
            cost_usd=llm_free_attempt.cost_usd,
            accuracy=llm_free_attempt.accuracy,
            confidence=llm_free_attempt.confidence,
            field_scores=llm_free_attempt.field_scores,
            error=llm_free_attempt.error,
            notes={"fallback_triggered": False},
        )

    llm_attempt = await _run_llm_mode(
        product,
        llm_config,
        iteration=iteration,
        headless=headless,
        prompt_version=prompt_version,
    )
    chosen_attempt = llm_attempt
    if _attempt_score(llm_free_attempt) > _attempt_score(llm_attempt):
        chosen_attempt = llm_free_attempt

    return BenchmarkAttempt(
        mode_requested="auto",
        mode_used=chosen_attempt.mode_used,
        sku=product.sku,
        url=product.url,
        iteration=iteration,
        success=chosen_attempt.success,
        duration_ms=llm_free_attempt.duration_ms + llm_attempt.duration_ms,
        cost_usd=llm_attempt.cost_usd,
        accuracy=chosen_attempt.accuracy,
        confidence=chosen_attempt.confidence,
        field_scores=chosen_attempt.field_scores,
        error=chosen_attempt.error,
        notes={
            "fallback_triggered": True,
            "llm_free_mode_used": llm_free_attempt.mode_used,
            "llm_free_score": round(_attempt_score(llm_free_attempt), 4),
            "llm_score": round(_attempt_score(llm_attempt), 4),
        },
    )


def _safe_mean(values: list[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int((len(ordered) - 1) * ratio)
    return ordered[index]


def _summarize_mode(mode: str, attempts: list[BenchmarkAttempt]) -> dict[str, Any]:
    durations = [attempt.duration_ms for attempt in attempts]
    costs = [attempt.cost_usd for attempt in attempts]
    accuracies = [attempt.accuracy for attempt in attempts if attempt.accuracy is not None]
    actual_modes = Counter(attempt.mode_used for attempt in attempts)
    success_count = sum(1 for attempt in attempts if attempt.success)

    return {
        "mode": mode,
        "runs": len(attempts),
        "success_rate": round(success_count / len(attempts), 4) if attempts else 0.0,
        "average_duration_ms": round(_safe_mean(durations), 2),
        "p95_duration_ms": round(_percentile(durations, 0.95), 2),
        "total_cost_usd": round(sum(costs), 6),
        "average_cost_usd": round(_safe_mean(costs), 6),
        "average_accuracy": None if not accuracies else round(_safe_mean(accuracies), 4),
        "actual_mode_counts": dict(actual_modes),
    }


def _build_report(
    *,
    requested_mode: str,
    benchmark_modes: tuple[str, ...],
    products_path: Path,
    iterations: int,
    llm_config: BenchmarkLLMConfig,
    attempts: list[BenchmarkAttempt],
) -> dict[str, Any]:
    summaries = []
    for mode in benchmark_modes:
        mode_attempts = [attempt for attempt in attempts if attempt.mode_requested == mode]
        summaries.append(_summarize_mode(mode, mode_attempts))

    comparison = sorted(
        summaries,
        key=lambda item: (
            -(item["average_accuracy"] or 0.0),
            item["average_cost_usd"],
            item["average_duration_ms"],
        ),
    )

    return {
        "metadata": {
            "requested_mode": requested_mode,
            "benchmark_modes": list(benchmark_modes),
            "products_path": str(products_path),
            "iterations": iterations,
            "llm_provider": llm_config.provider,
            "llm_model": llm_config.model,
            "auto_acceptance_threshold": AUTO_ACCEPTANCE_THRESHOLD,
            "generated_at_epoch": round(time.time(), 3),
        },
        "summary": {
            "products_benchmarked": len({attempt.sku for attempt in attempts}),
            "total_runs": len(attempts),
            "mode_comparison": comparison,
        },
        "results": [attempt.to_dict() for attempt in attempts],
    }


def _render_markdown_report(report: dict[str, Any]) -> str:
    metadata = report["metadata"]
    rows = report["summary"]["mode_comparison"]

    lines = [
        "# crawl4ai benchmark report",
        "",
        f"- Requested mode: `{metadata['requested_mode']}`",
        f"- Benchmarked modes: {', '.join(metadata['benchmark_modes'])}",
        f"- Products file: `{metadata['products_path']}`",
        f"- Iterations: {metadata['iterations']}",
        f"- LLM provider/model: `{metadata['llm_provider']}` / `{metadata['llm_model']}`",
        "",
        "## Mode comparison",
        "",
        "| Mode | Success | Avg Accuracy | Avg Time (ms) | P95 (ms) | Avg Cost | Actual Modes |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]

    for row in rows:
        accuracy = "n/a" if row["average_accuracy"] is None else f"{row['average_accuracy']:.4f}"
        actual_modes = ", ".join(f"{mode}:{count}" for mode, count in sorted(row["actual_mode_counts"].items()))
        lines.append(
            "| {mode} | {success:.2%} | {accuracy} | {avg_ms:.2f} | {p95:.2f} | ${cost:.6f} | {actual_modes} |".format(
                mode=row["mode"],
                success=row["success_rate"],
                accuracy=accuracy,
                avg_ms=row["average_duration_ms"],
                p95=row["p95_duration_ms"],
                cost=row["average_cost_usd"],
                actual_modes=actual_modes or "n/a",
            )
        )

    return "\n".join(lines) + "\n"


def _write_report(output_path: Path, report: dict[str, Any]) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.suffix.lower() == ".md":
        _ = output_path.write_text(_render_markdown_report(report), encoding="utf-8")
        return output_path

    _ = output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return output_path


def _echo_summary(report: dict[str, Any], output_path: Path | None) -> None:
    click.echo("\nMode comparison")
    click.echo("mode      success   accuracy   avg_ms   avg_cost")
    for row in report["summary"]["mode_comparison"]:
        success_rate = f"{row['success_rate']:.1%}"
        accuracy = "n/a" if row["average_accuracy"] is None else f"{row['average_accuracy']:.3f}"
        click.echo(f"{row['mode']:<9} {success_rate:<8} {accuracy:<9} {row['average_duration_ms']:<8.2f} ${row['average_cost_usd']:.6f}")

    if output_path is not None:
        click.echo(f"\nReport written to {output_path}")


async def _run_benchmark_suite(
    *,
    benchmark_modes: tuple[str, ...],
    products: list[BenchmarkProduct],
    iterations: int,
    llm_config: BenchmarkLLMConfig,
    headless: bool,
    prompt_version: str,
) -> list[BenchmarkAttempt]:
    attempts: list[BenchmarkAttempt] = []

    for mode in benchmark_modes:
        for product in products:
            for iteration in range(1, iterations + 1):
                click.echo(f"[{mode}] {product.label} ({iteration}/{iterations})")
                try:
                    if mode == "llm-free":
                        attempt = await _run_llm_free_mode(
                            product,
                            llm_config,
                            iteration=iteration,
                            headless=headless,
                            prompt_version=prompt_version,
                        )
                    elif mode == "llm":
                        attempt = await _run_llm_mode(
                            product,
                            llm_config,
                            iteration=iteration,
                            headless=headless,
                            prompt_version=prompt_version,
                        )
                    else:
                        attempt = await _run_auto_mode(
                            product,
                            llm_config,
                            iteration=iteration,
                            headless=headless,
                            prompt_version=prompt_version,
                        )
                except Exception as exc:  # pragma: no cover - defensive CLI guard
                    attempt = _build_attempt(
                        product=product,
                        iteration=iteration,
                        mode_requested=mode,
                        mode_used=mode,
                        success=False,
                        duration_ms=0.0,
                        cost_usd=0.0,
                        error=str(exc),
                    )

                attempts.append(attempt)

    return attempts


@click.command(name="extraction")
@click.option(
    "--mode",
    "mode",
    "-m",
    type=click.Choice(SUPPORTED_MODES, case_sensitive=False),
    default="auto",
    show_default=True,
    help="Mode to benchmark. 'auto' runs llm-free, llm, and auto side-by-side.",
)
@click.option(
    "--products",
    "products_path",
    "-p",
    required=True,
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="JSON file containing benchmark product URLs and optional expected values.",
)
@click.option(
    "--iterations",
    "iterations",
    "-i",
    default=3,
    show_default=True,
    type=click.IntRange(min=1),
    help="Number of iterations per product and mode.",
)
@click.option(
    "--output",
    "output_path",
    "-o",
    type=click.Path(dir_okay=False, path_type=Path),
    help="Optional report output path (.json or .md).",
)
@click.option(
    "--llm-provider",
    "llm_provider",
    type=click.Choice(("auto", "openai", "gemini", "openai_compatible"), case_sensitive=False),
    default="auto",
    show_default=True,
    help="Provider used for llm and auto benchmark modes.",
)
@click.option(
    "--llm-model",
    "llm_model",
    help="Optional model override for llm and auto benchmark modes.",
)
@click.option(
    "--max-cost-usd",
    "max_cost_usd",
    type=click.FloatRange(min=0.0),
    default=2.0,
    show_default=True,
    help="Abort if worst-case projected benchmark cost exceeds this limit.",
)
@click.confirmation_option(prompt="This benchmark may incur API costs. Continue?")
def benchmark_extraction(
    mode: str,
    products_path: Path,
    iterations: int,
    output_path: Path | None,
    llm_provider: str,
    llm_model: str | None,
    max_cost_usd: float,
) -> None:
    """Benchmark crawl4ai extraction strategies on sample products.

    .. deprecated:: Use ``benchmark_unified run`` instead.
    """
    import warnings

    warnings.warn(
        "The 'benchmark extraction' command is deprecated. Use 'benchmark_unified run' instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    click.echo(click.style("⚠ DEPRECATED: Use 'benchmark_unified run' instead.", fg="yellow"))
    products = _load_products(products_path)
    benchmark_modes = _resolve_benchmark_modes(mode)
    llm_config = _resolve_llm_config(llm_provider, llm_model)

    if _requires_llm(benchmark_modes) and not llm_config.ready:
        raise click.ClickException(
            "LLM benchmarking requires credentials. Set OPENAI_API_KEY, GEMINI_API_KEY, or OPENAI_COMPATIBLE_BASE_URL before running llm/auto benchmarks."
        )

    projected_cost_usd = _projected_cost_usd(len(products), iterations, benchmark_modes)
    if projected_cost_usd > max_cost_usd:
        raise click.ClickException(
            "Projected worst-case cost ${projected:.2f} exceeds max-cost-usd ${limit:.2f}. Lower iterations/products or raise the limit intentionally.".format(
                projected=projected_cost_usd,
                limit=max_cost_usd,
            )
        )

    attempts = asyncio.run(
        _run_benchmark_suite(
            benchmark_modes=benchmark_modes,
            products=products,
            iterations=iterations,
            llm_config=llm_config,
            headless=DEFAULT_HEADLESS,
            prompt_version=DEFAULT_PROMPT_VERSION,
        )
    )
    report = _build_report(
        requested_mode=mode,
        benchmark_modes=benchmark_modes,
        products_path=products_path,
        iterations=iterations,
        llm_config=llm_config,
        attempts=attempts,
    )

    written_path: Path | None = None
    if output_path is not None:
        written_path = _write_report(output_path, report)
    elif len(benchmark_modes) > 1:
        default_path = DEFAULT_OUTPUT_DIR / f"crawl4ai-benchmark-{int(time.time())}.json"
        written_path = _write_report(default_path, report)

    _echo_summary(report, written_path)


def register_benchmark_commands(benchmark_group: click.Group) -> None:
    """Register benchmark CLI commands."""
    benchmark_group.add_command(benchmark_extraction)
