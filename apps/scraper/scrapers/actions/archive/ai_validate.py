from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry


@ActionRegistry.register("ai_validate")
class AIValidateAction(BaseAction):
    async def execute(self, params: dict[str, Any]) -> dict[str, Any]:
        required_fields = self._coerce_list(params.get("required_fields", []))
        sku_must_match = self._coerce_bool(params.get("sku_must_match", True), True)
        min_confidence = self._coerce_float(params.get("min_confidence", 0.0), default=0.0, min_value=0.0, max_value=1.0)

        extracted = self._get_extracted_data()
        query_sku = self._get_query_sku()
        report = self._validate(
            extracted_data=extracted,
            query_sku=query_sku,
            required_fields=required_fields,
            sku_must_match=sku_must_match,
            min_confidence=min_confidence,
        )

        self.ctx.results["validation_passed"] = report["passed"]
        self.ctx.results["validation_errors"] = report["errors"]
        self.ctx.results["validation_report"] = report
        self.ctx.results["ai_validation_report"] = report
        return report

    def _validate(
        self,
        *,
        extracted_data: dict[str, Any],
        query_sku: str | None,
        required_fields: list[str],
        sku_must_match: bool,
        min_confidence: float,
    ) -> dict[str, Any]:
        errors: list[str] = []
        warnings: list[str] = []

        confidence = self._extract_confidence(extracted_data)
        missing_fields = self._missing_required_fields(extracted_data, required_fields)
        if missing_fields:
            errors.append(f"Missing required fields: {', '.join(missing_fields)}")
        if confidence < min_confidence:
            errors.append(f"Confidence too low: {confidence:.3f} (minimum: {min_confidence:.3f})")

        sku_match = True
        if sku_must_match and query_sku:
            extracted_sku = self._extract_sku(extracted_data)
            if extracted_sku:
                sku_match = self._fuzzy_sku_match(query_sku, extracted_sku)
                if not sku_match:
                    errors.append(f"SKU mismatch: expected '{query_sku}', found '{extracted_sku}'")
            else:
                sku_match = False
                warnings.append("No SKU found in extracted data")

        return {
            "passed": not errors and sku_match,
            "confidence": round(confidence, 3),
            "sku_match": sku_match,
            "missing_fields": missing_fields,
            "errors": errors,
            "warnings": warnings,
        }

    def _get_extracted_data(self) -> dict[str, Any]:
        data = self.ctx.results.get("ai_extracted_data")
        if isinstance(data, dict) and data:
            return data
        fallback = self.ctx.results.get("ai_extract_results")
        if isinstance(fallback, list) and fallback and isinstance(fallback[0], dict):
            return fallback[0]
        return {}

    def _get_query_sku(self) -> str | None:
        from_results = self.ctx.results.get("sku")
        if isinstance(from_results, str) and from_results.strip():
            return from_results.strip()
        from_context = self.ctx.context.get("sku")
        if isinstance(from_context, str) and from_context.strip():
            return from_context.strip()
        return None

    def _extract_confidence(self, data: dict[str, Any]) -> float:
        score = data.get("_confidence")
        if isinstance(score, (int, float)) and not isinstance(score, bool):
            return float(score)
        values = [v for k, v in data.items() if not str(k).startswith("_")]
        if not values:
            return 0.0
        present = 0
        for value in values:
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            if isinstance(value, (list, dict)) and len(value) == 0:
                continue
            present += 1
        return present / len(values)

    def _extract_sku(self, data: dict[str, Any]) -> str | None:
        for field in ("sku", "SKU", "upc", "UPC", "mpn", "MPN"):
            value = data.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _missing_required_fields(self, data: dict[str, Any], required_fields: list[str]) -> list[str]:
        missing: list[str] = []
        for field in required_fields:
            value = data.get(field)
            if value is None:
                missing.append(field)
                continue
            if isinstance(value, str) and not value.strip():
                missing.append(field)
                continue
            if isinstance(value, (list, dict)) and len(value) == 0:
                missing.append(field)
        return missing

    def _fuzzy_sku_match(self, query_sku: str, extracted_sku: str) -> bool:
        query_normalized = query_sku.lower().strip()
        extracted_normalized = extracted_sku.lower().strip()
        if query_normalized == extracted_normalized:
            return True
        if (query_normalized.lstrip("0") or "0") == (extracted_normalized.lstrip("0") or "0"):
            return True
        similarity = SequenceMatcher(None, query_normalized, extracted_normalized).ratio()
        return similarity >= 0.8

    def _coerce_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if item is not None]
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return []

    def _coerce_bool(self, value: Any, default: bool) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes", "y"}:
                return True
            if lowered in {"false", "0", "no", "n"}:
                return False
        return default

    def _coerce_float(
        self,
        value: Any,
        *,
        default: float,
        min_value: float | None = None,
        max_value: float | None = None,
    ) -> float:
        try:
            if isinstance(value, bool):
                raise ValueError("bool not allowed")
            parsed = float(value)
        except Exception:
            parsed = default
        if min_value is not None:
            parsed = max(min_value, parsed)
        if max_value is not None:
            parsed = min(max_value, parsed)
        return parsed
