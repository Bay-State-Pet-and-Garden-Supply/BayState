from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Final

from scrapers.ai_search.matching import MatchingUtils


ProductRecord = Mapping[str, object]


class CohortProcessor:
    """Group products into reusable cohorts for batch processing."""

    _AI_SEARCH_VARIANT_HINTS: Final[set[str]] = {
        "small",
        "medium",
        "large",
        "xlarge",
        "xl",
        "jumbo",
        "mini",
        "fresh",
        "scented",
        "unscented",
        "original",
        "natural",
        "count",
        "gray",
        "grey",
        "white",
        "black",
        "blue",
        "red",
    }

    def __init__(
        self,
        grouping_strategy: str = "upc_prefix",
        prefix_length: int = 6,
        upc_field: str = "sku",
        brand_field: str = "brand",
        name_field: str = "product_name",
    ) -> None:
        if prefix_length < 1:
            raise ValueError("prefix_length must be greater than 0")

        self.strategy: str = grouping_strategy
        self.prefix_length: int = prefix_length
        self.upc_field: str = upc_field
        self.brand_field: str = brand_field
        self.name_field: str = name_field
        self._matching: MatchingUtils = MatchingUtils()

    def build_cohort_key(self, product: ProductRecord) -> str:
        """Generate a cohort key from product data."""
        if self.strategy == "upc_prefix":
            return self._build_upc_prefix_key(product)
        if self.strategy == "ai_search_family":
            return self._build_ai_search_family_key(product)
        raise ValueError(f"Unknown strategy: {self.strategy}")

    def group_products(self, products: list[ProductRecord]) -> dict[str, list[ProductRecord]]:
        """Group products by cohort key, skipping invalid keys."""
        cohorts: dict[str, list[ProductRecord]] = defaultdict(list)
        for product in products:
            key = self.build_cohort_key(product)
            if key:
                cohorts[key].append(product)
        return dict(cohorts)

    def get_cohort_metadata(self, cohort_key: str, products: Sequence[ProductRecord]) -> dict[str, object]:
        """Return common cohort metadata for inspection or downstream use."""
        if not products:
            return {}

        brands = {str(product.get(self.brand_field) or "") for product in products if product.get(self.brand_field)}
        categories = {str(product.get("category") or "") for product in products if product.get("category")}

        metadata: dict[str, object] = {
            "cohort_key": cohort_key,
            "grouping_strategy": self.strategy,
            "product_count": len(products),
            "common_brands": sorted(brands) if len(brands) == 1 else [],
            "common_categories": sorted(categories) if len(categories) == 1 else [],
        }

        if self.strategy == "upc_prefix":
            metadata["upc_prefix"] = cohort_key

        return metadata

    def _build_upc_prefix_key(self, product: ProductRecord) -> str:
        upc = str(product.get(self.upc_field) or "").strip()
        if not upc or not upc.isdigit():
            return ""
        if len(upc) < self.prefix_length:
            return upc
        return upc[: self.prefix_length]

    def _build_ai_search_family_key(self, product: ProductRecord) -> str:
        brand = self._matching.normalize_token_text(str(product.get(self.brand_field) or ""))
        product_name = str(product.get(self.name_field) or "")
        brand_tokens = self._matching.tokenize_keywords(str(product.get(self.brand_field) or ""))
        name_tokens = [
            token
            for token in self._matching.tokenize_keywords(product_name)
            if (token not in brand_tokens and token not in self._AI_SEARCH_VARIANT_HINTS and not any(character.isdigit() for character in token))
        ]
        family_tokens = name_tokens[:4]
        if family_tokens:
            family_key = "-".join(family_tokens)
        else:
            normalized_name = self._matching.normalize_token_text(product_name)
            family_key = normalized_name[:32] or self._matching.normalize_token_text(str(product.get(self.upc_field) or ""))

        return f"{brand or 'unknown'}::{family_key or 'unknown'}"
