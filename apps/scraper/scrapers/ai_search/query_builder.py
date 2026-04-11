"""Query building utilities for AI Search."""

import re
from typing import Optional


class QueryBuilder:
    """Builds search queries for product AI Search."""

    _ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")
    _CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]+")
    _WHITESPACE_RE = re.compile(r"\s+")
    _AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH = 5

    def _clean_text(self, value: Optional[str]) -> str:
        """Normalize free-form query text before interpolation into search queries."""
        text = str(value or "")
        text = self._ANSI_ESCAPE_RE.sub(" ", text)
        text = self._CONTROL_RE.sub(" ", text)
        text = text.replace('"', " ").replace("'", " ")
        text = self._WHITESPACE_RE.sub(" ", text)
        return text.strip()

    def _normalize_domain(self, value: Optional[str]) -> str:
        domain = self._clean_text(value).lower().strip("/")
        if domain.startswith("http://"):
            domain = domain[len("http://") :]
        elif domain.startswith("https://"):
            domain = domain[len("https://") :]
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.split("/", 1)[0].strip()

    def _dedupe_queries(self, queries: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for query in queries:
            if query and query not in seen:
                seen.add(query)
                deduped.append(query)
        return deduped

    def build_identifier_query(self, sku: Optional[str]) -> str:
        """Build the lowest-cost identifier-only query for a product."""
        return self._clean_text(sku)

    def build_name_query(self, product_name: Optional[str]) -> str:
        """Build the canonical follow-up query from a consolidated product name."""
        return self._clean_text(product_name)

    def is_ambiguous_identifier(self, sku: Optional[str]) -> bool:
        """Return True when an identifier-only query is likely too generic to stand on its own."""
        sku_clean = self._clean_text(sku)
        return bool(sku_clean) and sku_clean.isdigit() and len(sku_clean) < self._AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH

    def build_search_query(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str] = None,
    ) -> str:
        """Build the preferred discovery query for the current search step."""
        del brand, category
        return self.build_name_query(product_name) or self.build_identifier_query(sku)

    def build_query_variants(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
    ) -> list[str]:
        """Build the single follow-up name query used after SKU discovery."""
        del sku, brand, category
        name_query = self.build_name_query(product_name)
        return self._dedupe_queries([name_query] if name_query else [])

    def build_site_query_variants(
        self,
        domains: list[str] | None,
        sku: Optional[str],
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
    ) -> list[str]:
        """Build site-constrained rescue queries using only SKU and consolidated name."""
        del brand, category
        sku_clean = self.build_identifier_query(sku)
        name_clean = self.build_name_query(product_name)

        variants: list[str] = []
        for domain in domains or []:
            domain_clean = self._normalize_domain(domain)
            if not domain_clean:
                continue

            prefix = f"site:{domain_clean}"
            if sku_clean:
                variants.append(f"{prefix} {sku_clean}")
            if name_clean:
                variants.append(f"{prefix} {name_clean}")

        return self._dedupe_queries(variants)
