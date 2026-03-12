"""Query building utilities for AI Search."""

import os
from typing import Optional


class QueryBuilder:
    """Builds search queries for product AI Search."""

    def build_search_query(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str] = None,
    ) -> str:
        """Build an effective search query for the product."""
        sku_clean = str(sku or "").strip()
        name_clean = str(product_name or "").strip()
        brand_clean = str(brand or "").strip()
        category_clean = str(category or "").strip()

        query_tokens: list[str] = []
        if brand_clean:
            query_tokens.append(brand_clean)
        if name_clean:
            query_tokens.append(name_clean)
        
        # Handle SKUs with specific prefixes for better search engine indexing
        if sku_clean:
            if sku_clean.isdigit():
                if len(sku_clean) in (12, 13, 14):
                    query_tokens.append(f"UPC {sku_clean}")
                else:
                    query_tokens.append(f"SKU {sku_clean}")
            else:
                query_tokens.append(sku_clean)

        if category_clean:
            query_tokens.append(category_clean)

        # Higher intent keywords than just 'product details'
        query_tokens.extend(
            [
                "official",
                "product",
                "manufacturer",
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
            query_tokens.append(f"site:{brand_clean.split()[0].lower()}.com")

        return " ".join(token for token in query_tokens if token)

    def build_query_variants(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
    ) -> list[str]:
        """Build multiple query variants to try."""
        sku_clean = str(sku or "").strip()
        name_clean = str(product_name or "").strip()
        brand_clean = str(brand or "").strip()

        variants: list[str] = []

        # Variant 1: SKU with prefix (most effective for product mapping)
        if sku_clean:
            if sku_clean.isdigit() and len(sku_clean) in (12, 13, 14):
                variants.append(f"UPC {sku_clean} official")
            else:
                variants.append(f"SKU {sku_clean} official")

        # Variant 2: Brand + Name (classic search)
        tokens = [t for t in [brand_clean, name_clean] if t]
        if len(tokens) >= 2:
            variants.append(" ".join(tokens) + " manufacturer")

        # Variant 3: Name + SKU (brand missing)
        if name_clean and sku_clean:
            variants.append(f"{name_clean} {sku_clean}")

        # Remove duplicates while preserving order
        seen: set[str] = set()
        deduped: list[str] = []
        for v in variants:
            if v and v not in seen:
                seen.add(v)
                deduped.append(v)

        return deduped
