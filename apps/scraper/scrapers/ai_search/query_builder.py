"""Query building utilities for AI Search."""

import os
import re
from typing import Optional


class QueryBuilder:
    """Builds search queries for product AI Search."""

    _ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")
    _CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]+")
    _WHITESPACE_RE = re.compile(r"\s+")

    def _clean_text(self, value: Optional[str]) -> str:
        """Normalize free-form query text before interpolation into search queries."""
        text = str(value or "")
        text = self._ANSI_ESCAPE_RE.sub(" ", text)
        text = self._CONTROL_RE.sub(" ", text)
        text = text.replace('"', " ").replace("'", " ")
        text = self._WHITESPACE_RE.sub(" ", text)
        return text.strip()

    def build_identifier_query(self, sku: Optional[str]) -> str:
        """Build the lowest-cost identifier-only query for a product."""
        return self._clean_text(sku)

    def build_search_query(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str] = None,
    ) -> str:
        """Build an effective search query for the product."""
        sku_clean = self._clean_text(sku)
        name_clean = self._clean_text(product_name)
        brand_clean = self._clean_text(brand)
        category_clean = self._clean_text(category)

        query_tokens: list[str] = []
        if brand_clean:
            query_tokens.append(brand_clean)
        if name_clean:
            query_tokens.append(name_clean)

        if sku_clean:
            query_tokens.append(sku_clean)
            if sku_clean.isdigit() and len(sku_clean) in (12, 13, 14):
                query_tokens.append(f"UPC {sku_clean}")

        if category_clean:
            query_tokens.append(category_clean)

        query_tokens.extend(
            [
                "product",
                "details",
                "-review",
                "-comparison",
                "-reddit",
                "-youtube",
                "-pinterest",
                "-coupon",
            ]
        )

        enable_brand_site_bias = os.getenv("BRAVE_BRAND_SITE_BIAS", "false").lower() == "true"
        if brand_clean and enable_brand_site_bias:
            brand_site_token = re.sub(r"[^a-z0-9]", "", brand_clean.lower())
            if brand_site_token:
                query_tokens.append(f"site:{brand_site_token}.com")

        return " ".join(token for token in query_tokens if token)

    def build_query_variants(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
    ) -> list[str]:
        """Build multiple query variants to try."""
        sku_clean = self._clean_text(sku)
        name_clean = self._clean_text(product_name)
        brand_clean = self._clean_text(brand)
        category_clean = self._clean_text(category)

        variants: list[str] = []

        if sku_clean and sku_clean.isdigit() and len(sku_clean) in (12, 13, 14):
            variants.append(f"UPC {sku_clean}")

        if name_clean and sku_clean:
            variants.append(f"{name_clean} {sku_clean}")

        if brand_clean and name_clean:
            variants.append(f"{brand_clean} {name_clean}")

        if brand_clean and name_clean and sku_clean:
            variants.append(f"{brand_clean} {name_clean} {sku_clean}")

        if brand_clean and category_clean and sku_clean:
            variants.append(f"{brand_clean} {category_clean} {sku_clean}")

        if not variants and name_clean:
            variants.append(name_clean)
        elif not variants and brand_clean:
            variants.append(brand_clean)
        elif not variants and category_clean:
            variants.append(category_clean)

        seen: set[str] = set()
        deduped: list[str] = []
        for v in variants:
            if v and v not in seen:
                seen.add(v)
                deduped.append(v)

        return deduped
