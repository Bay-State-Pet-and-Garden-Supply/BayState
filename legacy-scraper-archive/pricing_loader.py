"""
Shared pricing catalog loader for AI model cost calculation.

Reads pricing data from shared/ai-pricing/pricing-catalog.json and provides
cost calculation using the shared pricing catalog.
"""

import json
import logging
import re
from pathlib import Path
from functools import lru_cache

logger = logging.getLogger(__name__)

# Search paths for the pricing catalog (in priority order)
# 1. Relative to this file (local dev: apps/scraper/scrapers/ → repo root)
# 2. Docker image path (catalog copied into /app/shared/)
_CATALOG_SEARCH_PATHS = [
    Path(__file__).resolve().parents[3] / "shared" / "ai-pricing" / "pricing-catalog.json",
    Path("/app/shared/ai-pricing/pricing-catalog.json"),
]

# Pattern to strip snapshot date suffixes like "-2024-07-18" from model names
_SNAPSHOT_SUFFIX_PATTERN = re.compile(r"-\d{4}-\d{2}-\d{2}$")


def _strip_snapshot_suffix(model: str) -> str:
    """Strip date snapshot suffix from a model name.

    Examples:
        gpt-4o-mini-2024-07-18 → gpt-4o-mini
        gpt-4o → gpt-4o
        gemini-2.5-flash-preview-05-20 → gemini-2.5-flash-preview-05-20
    """
    return _SNAPSHOT_SUFFIX_PATTERN.sub("", model)


@lru_cache(maxsize=1)
def _load_catalog() -> dict:
    """Load and cache the pricing catalog JSON.

    Returns:
        Parsed catalog dict with 'models' list.

    Raises:
        FileNotFoundError: If catalog file not found on any search path.
    """
    for path in _CATALOG_SEARCH_PATHS:
        if path.exists():
            logger.debug("Loading pricing catalog from %s", path)
            with open(path) as f:
                return json.load(f)

    searched = ", ".join(str(p) for p in _CATALOG_SEARCH_PATHS)
    raise FileNotFoundError(f"Pricing catalog not found. Searched: {searched}")


def _build_pricing_table() -> dict[str, tuple[float, float]]:
    """Build a lookup table from model name → (input_price, output_price).

    Uses sync mode pricing. Strips snapshot suffixes from model names
    so lookups work with both base and dated model names.

    Returns:
        Dict mapping model name to (input_price_per_1M, output_price_per_1M).
    """
    catalog = _load_catalog()
    table: dict[str, tuple[float, float]] = {}

    for entry in catalog.get("models", []):
        if entry.get("mode", "sync") != "sync":
            continue
        model = entry["model"]
        table[model] = (entry["input_price"], entry["output_price"])

    return table


def calculate_cost_from_catalog(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    """Calculate cost in USD using the shared pricing catalog.

    Args:
        model: Model name (e.g., "gpt-4o-mini" or "gpt-4o-mini-2024-07-18").
        input_tokens: Number of input/prompt tokens.
        output_tokens: Number of output/completion tokens.

    Returns:
        Cost in USD. Returns 0.0 for unknown models or zero tokens.
    """
    if input_tokens == 0 and output_tokens == 0:
        return 0.0

    try:
        table = _build_pricing_table()
    except FileNotFoundError:
        logger.warning("Pricing catalog not found; returning 0.0 cost for model '%s'", model)
        return 0.0

    # Try exact match first, then strip snapshot suffix
    pricing = table.get(model)
    if pricing is None:
        stripped = _strip_snapshot_suffix(model)
        pricing = table.get(stripped)

    if pricing is None:
        logger.warning("Unknown model '%s'; no pricing entry found, returning 0.0", model)
        return 0.0

    input_price, output_price = pricing
    cost = (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price
    return round(cost, 8)