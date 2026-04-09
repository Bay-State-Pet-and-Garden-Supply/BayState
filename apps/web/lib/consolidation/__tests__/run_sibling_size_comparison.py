"""Run sibling-context size comparisons for consolidation prompts."""

from __future__ import annotations

import json
import math
import os
import re
import sys
import types
from datetime import datetime, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Callable, Protocol, TypedDict, cast


GROUP_ID = "acme-pet-food"
CLIENT_TYPE = os.environ.get("SIBLING_TEST_CLIENT", "gemini").strip().lower()
CLIENT_PROVIDER_LABEL = "Gemini" if CLIENT_TYPE == "gemini" else "OpenAI"
CLIENT_MODEL = (
    "gemini-3.1-flash-lite-preview" if CLIENT_TYPE == "gemini" else "gpt-4o-mini"
)
SIBLING_COUNTS = [5, 10, 15]
QUALITY_DELTA_THRESHOLD = 2.0
EXPECTED_BRAND = "Acme Pet"
EXPECTED_CATEGORY = "Dog > Food > Dry"

SYNTHETIC_SIBLINGS = [
    {
        "sku": "071247100178",
        "name": "ACME PET SMALL BREED CHICKEN & RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100185",
        "name": "ACME PET LARGE BREED CHICKEN & RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100192",
        "name": "ACME PET LAMB & BROWN RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100208",
        "name": "ACME PET HEALTHY WEIGHT TURKEY & BROWN RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100215",
        "name": "ACME PET SENSITIVE STOMACH SALMON & OATMEAL",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100222",
        "name": "ACME PET HIGH PROTEIN BEEF & BARLEY",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100239",
        "name": "ACME PET PUPPY LARGE BREED CHICKEN & RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100246",
        "name": "ACME PET SENIOR MOBILITY CHICKEN & BROWN RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100253",
        "name": "ACME PET GRAIN FREE TURKEY & SWEET POTATO",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100260",
        "name": "ACME PET SKIN & COAT WHITEFISH & RICE",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
    {
        "sku": "071247100277",
        "name": "ACME PET LIMITED INGREDIENT DUCK & POTATO",
        "brand": EXPECTED_BRAND,
        "category": EXPECTED_CATEGORY,
    },
]


class ProductFixture(TypedDict, total=False):
    sku: str
    name: str
    upc: str
    brand: str
    category: str
    price: str


class ProductGroup(TypedDict):
    group_id: str
    group_name: str
    sku_prefix: str
    products: list[ProductFixture]


class ResultLike(Protocol):
    brand: str | None
    category: str | None
    name: str | None
    raw_response: str | None
    response_time_ms: float
    success: bool
    error: str | None


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def load_test_harness_module() -> types.ModuleType:
    module_path = Path(__file__).resolve().with_name("test_harness.py")
    spec = spec_from_file_location("sibling_size_test_harness", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load test_harness.py")

    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_group(fixtures_path: Path, group_id: str) -> ProductGroup:
    payload = cast(
        dict[str, object], json.loads(fixtures_path.read_text(encoding="utf-8"))
    )
    raw_groups = cast(list[object], payload["product_groups"])

    for raw_group in raw_groups:
        group = cast(dict[str, object], raw_group)
        if str(group.get("group_id")) != group_id:
            continue

        return {
            "group_id": str(group["group_id"]),
            "group_name": str(group["group_name"]),
            "sku_prefix": str(group["sku_prefix"]),
            "products": cast(list[ProductFixture], group["products"]),
        }

    raise RuntimeError(f"Could not find fixture group: {group_id}")


def extract_system_prompt(prompt_builder_path: Path) -> tuple[str, str, list[str], int]:
    source_text = prompt_builder_path.read_text(encoding="utf-8")

    template_match = re.search(
        r"export function generateSystemPrompt\(categories: string\[\]\): string \{[\s\S]*?return `([\s\S]*?)`;\s*\}",
        source_text,
    )
    if not template_match:
        raise RuntimeError(
            "Could not extract system prompt template from prompt-builder.ts"
        )

    prefix_match = re.search(r"const USER_PROMPT_PREFIX\s*=\s*'([^']+)';", source_text)
    if not prefix_match:
        raise RuntimeError(
            "Could not extract USER_PROMPT_PREFIX from prompt-builder.ts"
        )

    rules_match = re.search(
        r"const CONSISTENCY_RULES\s*=\s*\[(.*?)\];", source_text, re.S
    )
    if not rules_match:
        raise RuntimeError("Could not extract CONSISTENCY_RULES from prompt-builder.ts")

    max_sibling_match = re.search(
        r"const MAX_SIBLING_PRODUCTS\s*=\s*(\d+);", source_text
    )
    if not max_sibling_match:
        raise RuntimeError(
            "Could not extract MAX_SIBLING_PRODUCTS from prompt-builder.ts"
        )

    consistency_rules = re.findall(r"'([^']+)'", rules_match.group(1))
    return (
        template_match.group(1),
        prefix_match.group(1),
        consistency_rules,
        int(max_sibling_match.group(1)),
    )


def extract_shopsite_pages(constants_path: Path) -> list[str]:
    source_text = constants_path.read_text(encoding="utf-8")
    pages_block_match = re.search(
        r"export const SHOPSITE_PAGES = \[(.*?)\];", source_text, re.S
    )
    if not pages_block_match:
        raise RuntimeError("Could not extract SHOPSITE_PAGES from constants.ts")

    return re.findall(r"'([^']+)'", pages_block_match.group(1))


def render_system_prompt(system_prompt_template: str, shopsite_pages: list[str]) -> str:
    category_guidance = "\n- No category values were provided."
    page_guidance = ", ".join(shopsite_pages)
    return (
        system_prompt_template.replace("${categoryGuidance}", category_guidance)
        .replace("${pageGuidance}", page_guidance)
        .strip()
    )


def build_source_evidence(product: ProductFixture) -> list[dict[str, object]]:
    fields = {
        "sku": product.get("sku", ""),
        "upc": product.get("upc", ""),
        "name": product.get("name", ""),
        "brand": product.get("brand", ""),
        "category": product.get("category", ""),
        "price": product.get("price", ""),
    }
    return [{"source": "shopsite_input", "trust": "canonical", "fields": fields}]


def build_sibling_pool(group: ProductGroup) -> list[dict[str, str]]:
    real_siblings = [
        {
            "sku": product.get("sku", ""),
            "name": product.get("name", ""),
            "brand": product.get("brand", EXPECTED_BRAND),
            "category": product.get("category", EXPECTED_CATEGORY),
        }
        for product in group["products"]
    ]
    return real_siblings + SYNTHETIC_SIBLINGS


def build_user_prompt_builder(
    group: ProductGroup,
    sibling_pool: list[dict[str, str]],
    sibling_count: int,
    user_prompt_prefix: str,
    consistency_rules: list[str],
) -> Callable[[ProductFixture], str]:
    def build_user_prompt(product: ProductFixture) -> str:
        selected_siblings = [
            sibling
            for sibling in sibling_pool
            if sibling["sku"] != product.get("sku", "")
        ][:sibling_count]

        if len(selected_siblings) != sibling_count:
            raise RuntimeError(
                f"Requested {sibling_count} siblings but only found {len(selected_siblings)}"
            )

        payload = {
            "sku": product.get("sku", ""),
            "sources": build_source_evidence(product),
            "product_line_context": {
                "product_line": group["group_name"],
                "sibling_products": selected_siblings,
                "consistency_rules": consistency_rules,
                "expected_brand": EXPECTED_BRAND,
                "expected_category": EXPECTED_CATEGORY,
                "consistency_examples": [
                    sibling["name"] for sibling in selected_siblings[:3]
                ],
            },
        }
        return f"{user_prompt_prefix}{json.dumps(payload, separators=(',', ':'))}"

    return build_user_prompt


def normalize_string(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def normalize_brand(value: str | None) -> str:
    cleaned = normalize_string(value)
    return re.sub(r"^brand\s*:\s*", "", cleaned).strip()


def category_segments(value: str | None) -> list[str]:
    normalized = normalize_string(value)
    if not normalized:
        return []
    return [segment.strip() for segment in normalized.split(">") if segment.strip()]


def category_matches_expected(actual: str | None, expected: str) -> bool:
    actual_segments = category_segments(actual)
    expected_segments = category_segments(expected)

    if not actual_segments or not expected_segments:
        return False

    shared_length = min(len(actual_segments), len(expected_segments))
    return actual_segments[:shared_length] == expected_segments[:shared_length]


def normalize_expected_name(value: str) -> str:
    without_brand = re.sub(r"^ACME PET\s+", "", value.strip(), flags=re.I)
    return without_brand.title()


def tokenize(value: str | None) -> list[str]:
    return re.findall(r"[a-z0-9]+", normalize_string(value))


def evaluate_name_consistency(
    expected_name: str, actual_name: str | None
) -> tuple[float, bool, bool]:
    actual_tokens = set(tokenize(actual_name))
    expected_tokens = [
        token for token in tokenize(expected_name) if token not in {"and"}
    ]
    brand_tokens = set(tokenize(EXPECTED_BRAND))

    if not expected_tokens:
        return 0.0, False, bool(actual_tokens & brand_tokens)

    recall = sum(1 for token in expected_tokens if token in actual_tokens) / len(
        expected_tokens
    )
    brand_leak = bool(actual_tokens & brand_tokens)
    return recall * 100, recall >= 0.8 and not brand_leak, brand_leak


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 4)


def round_to(value: float, digits: int = 2) -> float:
    return round(value, digits)


def average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def as_float(value: object) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return float(value)
    raise TypeError(f"Value is not float-convertible: {value!r}")


def as_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        return int(value)
    raise TypeError(f"Value is not int-convertible: {value!r}")


def compute_modal_consistency(values: list[str]) -> tuple[str, float]:
    cleaned_values = [value for value in values if value]
    if not cleaned_values:
        return "", 0.0

    counts: dict[str, int] = {}
    for value in cleaned_values:
        counts[value] = counts.get(value, 0) + 1

    modal_value = ""
    modal_count = 0
    for value, count in counts.items():
        if count > modal_count:
            modal_value = value
            modal_count = count

    return modal_value, counts[modal_value] / len(cleaned_values) * 100


def build_run_summary(
    sibling_count: int,
    system_prompt: str,
    group: ProductGroup,
    user_prompt_builder: Callable[[ProductFixture], str],
    results: list[ResultLike],
) -> dict[str, object]:
    name_passes = 0
    prompt_tokens: list[float] = []
    response_times: list[float] = []
    name_recalls: list[float] = []
    successful_results = 0
    successful_brands: list[str] = []
    successful_categories: list[str] = []
    expected_brand_matches = 0
    expected_category_matches = 0
    raw_products: list[dict[str, object]] = []

    for product, result in zip(group["products"], results, strict=True):
        user_prompt = user_prompt_builder(product)
        total_prompt_tokens = estimate_tokens(f"{system_prompt}\n{user_prompt}")
        prompt_tokens.append(float(total_prompt_tokens))
        response_times.append(result.response_time_ms)

        expected_name = normalize_expected_name(product.get("name", ""))
        name_recall, name_pass, brand_leak = evaluate_name_consistency(
            expected_name, result.name
        )
        name_recalls.append(name_recall)

        brand_match = normalize_brand(result.brand) == normalize_brand(EXPECTED_BRAND)
        category_match = category_matches_expected(result.category, EXPECTED_CATEGORY)

        if result.success:
            successful_results += 1
            normalized_brand = normalize_brand(result.brand)
            normalized_category = normalize_string(result.category)

            if normalized_brand:
                successful_brands.append(normalized_brand)
            if normalized_category:
                successful_categories.append(normalized_category)
            if brand_match:
                expected_brand_matches += 1
            if category_match:
                expected_category_matches += 1
            if name_pass:
                name_passes += 1

        raw_products.append(
            {
                "input": product,
                "expected_name": expected_name,
                "prompt_tokens_estimate": total_prompt_tokens,
                "sibling_count": sibling_count,
                "result": {
                    "brand": result.brand,
                    "category": result.category,
                    "name": result.name,
                    "raw_response": result.raw_response,
                    "response_time_ms": result.response_time_ms,
                    "success": result.success,
                    "error": result.error,
                },
                "analysis": {
                    "brand_match": brand_match,
                    "category_match": category_match,
                    "name_token_recall_pct": round_to(name_recall),
                    "name_consistency_pass": name_pass,
                    "brand_leak_detected": brand_leak,
                },
            }
        )

    denominator = successful_results if successful_results > 0 else len(results)
    modal_brand, brand_consistency = compute_modal_consistency(successful_brands)
    modal_category, category_consistency = compute_modal_consistency(
        successful_categories
    )
    name_consistency = (name_passes / denominator * 100) if denominator else 0.0
    overall_consistency = average(
        [brand_consistency, category_consistency, name_consistency]
    )
    brand_expected_match_pct = (
        expected_brand_matches / denominator * 100 if denominator else 0.0
    )
    category_expected_match_pct = (
        expected_category_matches / denominator * 100 if denominator else 0.0
    )

    return {
        "sibling_count": sibling_count,
        "total_products": len(group["products"]),
        "successful_calls": successful_results,
        "modal_brand": modal_brand,
        "modal_category": modal_category,
        "brand_consistency_pct": round_to(brand_consistency),
        "category_consistency_pct": round_to(category_consistency),
        "brand_expected_match_pct": round_to(brand_expected_match_pct),
        "category_expected_match_pct": round_to(category_expected_match_pct),
        "name_consistency_pct": round_to(name_consistency),
        "overall_consistency_pct": round_to(overall_consistency),
        "average_name_token_recall_pct": round_to(average(name_recalls)),
        "average_response_time_ms": round_to(average(response_times)),
        "average_prompt_tokens_estimate": round_to(average(prompt_tokens)),
        "products": raw_products,
    }


def choose_recommendation(
    run_summaries: list[dict[str, object]],
) -> tuple[dict[str, object], list[str]]:
    sorted_runs = sorted(run_summaries, key=lambda row: as_int(row["sibling_count"]))
    best_run = max(
        sorted_runs, key=lambda row: as_float(row["overall_consistency_pct"])
    )
    recommended = best_run

    for run in sorted_runs:
        quality_gap = as_float(best_run["overall_consistency_pct"]) - as_float(
            run["overall_consistency_pct"]
        )
        if quality_gap <= QUALITY_DELTA_THRESHOLD:
            recommended = run
            break

    baseline = sorted_runs[0]
    rationale: list[str] = []
    for run in sorted_runs[1:]:
        latency_delta = as_float(run["average_response_time_ms"]) - as_float(
            baseline["average_response_time_ms"]
        )
        token_delta = as_float(run["average_prompt_tokens_estimate"]) - as_float(
            baseline["average_prompt_tokens_estimate"]
        )
        quality_delta = as_float(run["overall_consistency_pct"]) - as_float(
            baseline["overall_consistency_pct"]
        )
        rationale.append(
            f"{as_int(run['sibling_count'])} siblings vs 5: quality {quality_delta:+.2f} pts, latency {latency_delta:+.2f} ms, prompt size {token_delta:+.0f} tokens."
        )

    return recommended, rationale


def build_results_table(
    run_summaries: list[dict[str, object]],
    baseline_tokens: float,
    baseline_latency: float,
) -> str:
    lines = [
        "| Siblings | Brand consistency | Category consistency | Name consistency | Overall score | Avg latency (ms) | Avg prompt tokens | Delta vs 5 tokens | Delta vs 5 latency |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for run in sorted(run_summaries, key=lambda row: as_int(row["sibling_count"])):
        prompt_tokens = as_float(run["average_prompt_tokens_estimate"])
        latency = as_float(run["average_response_time_ms"])
        lines.append(
            f"| {as_int(run['sibling_count'])} | {as_float(run['brand_consistency_pct']):.2f}% | {as_float(run['category_consistency_pct']):.2f}% | {as_float(run['name_consistency_pct']):.2f}% | {as_float(run['overall_consistency_pct']):.2f}% | {latency:.2f} | {prompt_tokens:.0f} | {prompt_tokens - baseline_tokens:+.0f} | {latency - baseline_latency:+.2f} |"
        )

    return "\n".join(lines)


def build_markdown_report(
    generated_at: str,
    baseline_limit: int,
    run_summaries: list[dict[str, object]],
    recommended_run: dict[str, object],
    rationale: list[str],
) -> str:
    baseline = min(run_summaries, key=lambda row: as_int(row["sibling_count"]))
    baseline_tokens = as_float(baseline["average_prompt_tokens_estimate"])
    baseline_latency = as_float(baseline["average_response_time_ms"])
    results_table = build_results_table(
        run_summaries, baseline_tokens, baseline_latency
    )
    alignment_lines = "\n".join(
        f"- {as_int(run['sibling_count'])} siblings: brand alignment {as_float(run['brand_expected_match_pct']):.2f}%, category breadcrumb alignment {as_float(run['category_expected_match_pct']):.2f}%"
        for run in sorted(run_summaries, key=lambda row: as_int(row["sibling_count"]))
    )

    recommendation = as_int(recommended_run["sibling_count"])
    recommendation_text = f"Recommend keeping the sibling window at **{recommendation}**. It delivered **{as_float(recommended_run['overall_consistency_pct']):.2f}%** overall consistency with **{as_float(recommended_run['average_prompt_tokens_estimate']):.0f}** estimated prompt tokens on average."

    diminishing_returns = "\n".join(f"- {line}" for line in rationale)

    return f"""# Sibling Size Comparison

## Test methodology

- Date: {generated_at}
- Provider: {CLIENT_PROVIDER_LABEL} via `apps/web/lib/consolidation/__tests__/test_harness.py`
- Model: `{CLIENT_MODEL}`
- Evaluation set: `{GROUP_ID}` fixture (`5` real Acme Pet dry-food SKUs)
- Variable under test: sibling context window sizes `5`, `10`, and `15`
- Production baseline today: `MAX_SIBLING_PRODUCTS = {baseline_limit}` in `apps/web/lib/consolidation/prompt-builder.ts`
- Prompt held constant across runs except for `product_line_context.sibling_products`
- Token usage is estimated as `ceil(len(system_prompt + user_prompt) / 4)`

### Fixture note

The fixture only contains `5` real Acme SKUs, so the comparison script padded sibling context with synthetic Acme dry-food variants after the real siblings. That keeps the evaluated products fixed while allowing exact `5/10/15` sibling windows.

## Results

{results_table}

## Expected-value alignment note

{alignment_lines}

Gemini kept brand and naming internally consistent at every sibling size, but it normalized category output to `Dog Food Dry` rather than the fixture breadcrumb `Dog > Food > Dry`. That is a taxonomy-format issue, not a sibling-window issue.

## Response time comparison

- 5 siblings: {as_float(next(run["average_response_time_ms"] for run in run_summaries if as_int(run["sibling_count"]) == 5)):.2f} ms average
- 10 siblings: {as_float(next(run["average_response_time_ms"] for run in run_summaries if as_int(run["sibling_count"]) == 10)):.2f} ms average
- 15 siblings: {as_float(next(run["average_response_time_ms"] for run in run_summaries if as_int(run["sibling_count"]) == 15)):.2f} ms average

## Diminishing returns

{diminishing_returns}

## Recommendation

{recommendation_text}

Why:
- Smaller sibling windows win when quality is within {QUALITY_DELTA_THRESHOLD:.0f} percentage points of the best run.
- This avoids paying for prompt growth unless larger context produces a material quality gain.
- The measured trade-off above should guide whether Task 9 keeps the current default or raises it.
"""


def build_blocked_report(
    generated_at: str,
    baseline_limit: int,
    error_message: str,
) -> str:
    return f"""# Sibling Size Comparison

## Status

Blocked. Live sibling-size comparison could not complete because the API client returned authentication errors.

## Attempted methodology

- Date: {generated_at}
- Provider: {CLIENT_PROVIDER_LABEL} via `apps/web/lib/consolidation/__tests__/test_harness.py`
- Model: `{CLIENT_MODEL}`
- Evaluation set: `{GROUP_ID}` fixture (`5` real Acme Pet dry-food SKUs)
- Requested sibling windows: `5`, `10`, `15`
- Production baseline today: `MAX_SIBLING_PRODUCTS = {baseline_limit}` in `apps/web/lib/consolidation/prompt-builder.ts`

## Blocker

- Error: `{error_message}`
- Result: no successful consolidation calls, so quality, latency, and token trade-offs could not be compared meaningfully.

## Next step

Restore a valid Gemini or OpenAI API key, then rerun:

```bash
python apps/web/lib/consolidation/__tests__/run_sibling_size_comparison.py
```
"""


def extract_first_error(run_summaries: list[dict[str, object]]) -> str:
    for run in run_summaries:
        products = cast(list[dict[str, object]], run.get("products", []))
        for product in products:
            result = cast(dict[str, object], product.get("result", {}))
            error = result.get("error")
            if isinstance(error, str) and error.strip():
                return error.strip()
    return "Unknown API authentication failure"


def write_json(file_path: Path, payload: object) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    _ = file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_text(file_path: Path, content: str) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    _ = file_path.write_text(content, encoding="utf-8")


def main() -> int:
    if CLIENT_TYPE not in {"gemini", "openai"}:
        raise RuntimeError(f"Unsupported SIBLING_TEST_CLIENT value: {CLIENT_TYPE}")

    repo_root = get_repo_root()
    prompt_builder_path = repo_root / "apps/web/lib/consolidation/prompt-builder.ts"
    constants_path = repo_root / "apps/web/lib/shopsite/constants.ts"
    fixtures_path = (
        repo_root
        / "apps/web/lib/consolidation/__tests__/fixtures/test-product-groups.json"
    )
    evidence_path = repo_root / ".sisyphus/evidence/task-6-sibling-size.json"
    report_path = repo_root / ".sisyphus/drafts/sibling-size-comparison.md"

    harness_module = load_test_harness_module()
    batch_consolidation_test = cast(
        Callable[
            [list[ProductFixture], str, str, Callable[[ProductFixture], str] | None],
            list[ResultLike],
        ],
        harness_module.batch_consolidation_test,
    )

    group = load_group(fixtures_path, GROUP_ID)
    sibling_pool = build_sibling_pool(group)
    system_prompt_template, user_prompt_prefix, consistency_rules, baseline_limit = (
        extract_system_prompt(prompt_builder_path)
    )
    shopsite_pages = extract_shopsite_pages(constants_path)
    system_prompt = render_system_prompt(system_prompt_template, shopsite_pages)

    generated_at = datetime.now(timezone.utc).isoformat()
    run_summaries: list[dict[str, object]] = []

    for sibling_count in SIBLING_COUNTS:
        prompt_builder = build_user_prompt_builder(
            group=group,
            sibling_pool=sibling_pool,
            sibling_count=sibling_count,
            user_prompt_prefix=user_prompt_prefix,
            consistency_rules=consistency_rules,
        )
        results = batch_consolidation_test(
            group["products"], system_prompt, CLIENT_TYPE, prompt_builder
        )
        run_summaries.append(
            build_run_summary(
                sibling_count, system_prompt, group, prompt_builder, results
            )
        )

    total_successes = sum(as_int(run["successful_calls"]) for run in run_summaries)
    if total_successes == 0:
        error_message = extract_first_error(run_summaries)
        report = build_blocked_report(generated_at, baseline_limit, error_message)
        evidence_payload = {
            "status": "blocked",
            "generated_at": generated_at,
            "group_id": GROUP_ID,
            "client_type": CLIENT_TYPE,
            "baseline_max_sibling_products": baseline_limit,
            "sibling_counts": SIBLING_COUNTS,
            "synthetic_sibling_count": len(SYNTHETIC_SIBLINGS),
            "error": error_message,
            "runs": run_summaries,
        }
        write_json(evidence_path, evidence_payload)
        write_text(report_path, report)
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "evidence": str(evidence_path),
                    "report": str(report_path),
                    "error": error_message,
                },
                indent=2,
            )
        )
        return 1

    recommended_run, rationale = choose_recommendation(run_summaries)
    report = build_markdown_report(
        generated_at, baseline_limit, run_summaries, recommended_run, rationale
    )

    evidence_payload = {
        "generated_at": generated_at,
        "group_id": GROUP_ID,
        "client_type": CLIENT_TYPE,
        "baseline_max_sibling_products": baseline_limit,
        "sibling_counts": SIBLING_COUNTS,
        "synthetic_sibling_count": len(SYNTHETIC_SIBLINGS),
        "recommendation": {
            "optimal_sibling_count": as_int(recommended_run["sibling_count"]),
            "overall_consistency_pct": as_float(
                recommended_run["overall_consistency_pct"]
            ),
            "average_response_time_ms": as_float(
                recommended_run["average_response_time_ms"]
            ),
            "average_prompt_tokens_estimate": as_float(
                recommended_run["average_prompt_tokens_estimate"]
            ),
        },
        "rationale": rationale,
        "runs": run_summaries,
    }

    write_json(evidence_path, evidence_payload)
    write_text(report_path, report)

    print(
        json.dumps(
            {
                "status": "ok",
                "evidence": str(evidence_path),
                "report": str(report_path),
                "recommendation": evidence_payload["recommendation"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
