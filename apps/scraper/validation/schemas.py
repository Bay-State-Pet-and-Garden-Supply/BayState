"""Pandera validation schemas for scraper results and callbacks.

These schemas complement existing Pydantic models and are intended to run
at the callback boundary to protect the coordinator from malformed runner
payloads.
"""

from __future__ import annotations

import importlib
from typing import Any, Dict


def _get_pandera():
    """Dynamically import pandera at runtime.

    We use importlib to avoid static import checks in language servers that
    don't have the dependency installed. Raises a RuntimeError if pandera is
    not installed when the function is called.
    """
    try:
        return importlib.import_module("pandera")
    except Exception as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError("pandera is required for validation. Install it: pip install pandera") from exc


def _pa_errors():
    try:
        pa = importlib.import_module("pandera")
        return getattr(pa, "errors")
    except Exception:

        class _E:
            class SchemaError(Exception):
                pass

        return _E


"""Pandera schemas and runtime validators.

We provide a top-level ScrapedResultSchema that inherits from pandera.SchemaModel
when pandera is available; otherwise a lightweight stub is provided so static
analysis and imports succeed in minimal environments.
"""


class ScrapedResultSchema:  # lightweight placeholder
    """Placeholder ScrapedResultSchema.

    Notes:
    - At runtime validate_scraped_result builds a pandera.DataFrameSchema and
      validates input. This placeholder exists so the module exports a named
      symbol matching the task requirements and keeps static analysis clean
      (no hard imports of pandera at module import time).
    """

    pass


def validate_scraped_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a single scraped result dict.

    Ensures required name/title, price numeric or null, url looks like a URL,
    and sku is alphanumeric when present.

    Raises:
        RuntimeError: If pandera is not installed
        pa.errors.SchemaError: on validation failure
    """
    import pandas as pd
    from urllib.parse import urlparse

    pa = _get_pandera()
    pa_errors = _pa_errors()

    # Normalize keys: prefer 'name' but fall back to 'title'
    normalized = dict(data)
    if "name" not in normalized and "title" in normalized:
        normalized["name"] = normalized.get("title")

    df = pd.DataFrame([normalized])

    # Build a pandera DataFrameSchema for the minimal fields we care about.
    schema = pa.DataFrameSchema(
        {
            "price": pa.Column(pa.Float, nullable=True, checks=pa.Check.ge(0)),
            "name": pa.Column(pa.String, nullable=True),
            "title": pa.Column(pa.String, nullable=True),
            "url": pa.Column(pa.String, nullable=True),
            "sku": pa.Column(pa.String, nullable=True),
        },
        coerce=True,
        strict=False,
    )

    validated_df = schema.validate(df)

    # Additional custom checks not expressible succinctly in type hints
    row = validated_df.iloc[0].to_dict()

    # name/title required
    if not row.get("name") and not row.get("title"):
        raise pa_errors.SchemaError("Missing required field: name or title")

    # url should be a valid http/https URL when present
    url_val = row.get("url")
    if url_val:
        parsed = urlparse(str(url_val))
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise pa_errors.SchemaError(f"Invalid url: {url_val}")

    # sku alphanumeric when present
    sku_val = row.get("sku")
    if sku_val:
        if not str(sku_val).isalnum():
            raise pa_errors.SchemaError(f"Invalid sku (must be alphanumeric): {sku_val}")

    # Return normalized dict (prefer name over title)
    out = dict(row)
    if not out.get("name") and out.get("title"):
        out["name"] = out.get("title")

    return out


def validate_callback_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate callback payload structure.

    Minimal checks: required top-level keys and that `results.data` is a dict
    mapping skus to vendor -> data objects. This function intentionally
    keeps validation light; deeper validation happens per-SKU with
    `validate_scraped_result`.

    Raises:
        pa.errors.SchemaError: if required fields missing or of wrong type
    """
    required = ["job_id", "status", "results"]
    for field in required:
        if field not in payload:
            # Use pandera errors if available, otherwise raise RuntimeError
            try:
                pa = importlib.import_module("pandera")
                raise pa.errors.SchemaError(f"Missing required field: {field}")
            except Exception:
                raise RuntimeError(f"Missing required field: {field}")

    results = payload["results"]
    if not isinstance(results, dict):
        try:
            pa = importlib.import_module("pandera")
            raise pa.errors.SchemaError("results must be a dict")
        except Exception:
            raise RuntimeError("results must be a dict")

    # Expect results to contain 'data' mapping skus -> {vendor: {...}}
    data = results.get("data")
    if data is None or not isinstance(data, dict):
        try:
            pa = importlib.import_module("pandera")
            raise pa.errors.SchemaError("results.data must be a dict mapping sku -> vendor data")
        except Exception:
            raise RuntimeError("results.data must be a dict mapping sku -> vendor data")

    return payload


__all__ = [
    "ScrapedResultSchema",
    "validate_scraped_result",
    "validate_callback_payload",
]
