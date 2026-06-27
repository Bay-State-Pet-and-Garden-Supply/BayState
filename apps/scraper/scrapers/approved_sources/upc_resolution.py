"""UPC Resolution V2 — shared Python proof gates used by adapters.

These helpers mirror the TypeScript gates in apps/web/lib/upc-resolution/gates.ts.
They are used by official_brand_crawl and serp_candidate_discovery adapters
to determine whether evidence meets the accepted proof threshold for 'found'
versus 'not_stocked' + candidate evidence.
"""

from __future__ import annotations

import re
from typing import Any


def normalize_gtin(raw: str | None) -> str | None:
    """Normalize a GTIN/UPC by stripping non-digits and zero-padding to 14.

    Returns None for empty/invalid input.
    """
    if not raw:
        return None
    digits = re.sub(r"[^0-9]", "", raw.strip())
    if not digits:
        return None
    # Zero-pad to GTIN-14 for comparison
    return digits.zfill(14)


def validate_check_digit(upc: str) -> bool:
    """Validate the check digit of a GTIN-12/13/14.

    Supports GTIN-8, GTIN-12, GTIN-13, GTIN-14 by padding to 14 digits
    and computing the standard GS1 check digit.
    """
    digits = re.sub(r"[^0-9]", "", upc.strip())
    if len(digits) not in (8, 12, 13, 14):
        return False

    # Pad to 14 for check digit calculation
    padded = digits.zfill(14)

    total = 0
    for i, ch in enumerate(padded[:-1]):
        digit = int(ch)
        # Odd positions (1-indexed) from the left in GTIN-14
        if (i % 2) == 0:
            total += digit * 3
        else:
            total += digit * 1

    check = (10 - (total % 10)) % 10
    return check == int(padded[-1])


def compare_gtin(a: str | None, b: str | None) -> bool:
    """Compare two GTINs for identity equivalence (zero-padded GTIN-14)."""
    na = normalize_gtin(a)
    nb = normalize_gtin(b)
    if na is None or nb is None:
        return False
    return na == nb


def extract_upc_from_product(product: dict[str, Any] | None) -> str | None:
    """Extract a UPC/GTIN from a product dict, checking common field names.

    Checks top-level fields and EnrichedProductFacts-style nested facets.
    """
    if not product:
        return None

    # Check top-level fields
    for key in ("upc", "gtin", "gtin12", "gtin13", "gtin14", "barcode", "sku"):
        val = product.get(key)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    # Check nested core data
    core = product.get("core")
    if isinstance(core, dict):
        val = core.get("upc") or core.get("gtin") or core.get("barcode")
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    # Check facets
    facets = product.get("facets", [])
    if isinstance(facets, list):
        for facet in facets:
            if isinstance(facet, dict):
                slug = facet.get("definition_slug") or facet.get("slug") or ""
                if slug in ("upc", "gtin", "barcode", "item_number"):
                    val = facet.get("value") or facet.get("value_text") or ""
                    if val:
                        return str(val).strip()

    return None


def is_exact_upc_proof(
    expected_upc: str | None,
    product: dict[str, Any] | None,
) -> tuple[bool, str | None]:
    """Check if product evidence contains exact UPC proof.

    Returns (is_proven, observed_upc_or_reason).
    If proven, second element is the observed UPC.
    If not proven, second element is a reason string.
    """
    if not expected_upc or not product:
        return False, "missing_upc_or_product"

    observed_upc = extract_upc_from_product(product)
    if not observed_upc:
        return False, "no_upc_in_product"

    if not compare_gtin(expected_upc, observed_upc):
        return False, f"upc_mismatch: expected={expected_upc}, observed={observed_upc}"

    if not validate_check_digit(observed_upc):
        return False, f"check_digit_failed: {observed_upc}"

    return True, observed_upc


def build_candidate_evidence(
    candidate_url: str,
    observed_upc: str | None,
    reason: str,
    brand_name: str | None = None,
    title: str | None = None,
    confidence: float = 0.0,
) -> dict[str, Any]:
    """Build a resolutionEvidence payload for a candidate that did not pass gates."""
    evidence: dict[str, Any] = {
        "candidate_url": candidate_url,
        "reason": reason,
        "confidence": confidence,
    }
    if observed_upc:
        evidence["observed_upc"] = observed_upc
    if brand_name:
        evidence["brand"] = brand_name
    if title:
        evidence["title"] = title
    return evidence
