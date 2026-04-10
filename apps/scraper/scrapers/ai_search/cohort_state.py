"""Cohort state tracking for batch search operations.

This module provides the _BatchCohortState class which tracks preferred domains
and brands across multiple search results within a batch, enabling intelligent
ranking and selection of the most relevant product pages.
"""

from dataclasses import dataclass


@dataclass
class _BatchCohortState:
    """Tracks preferred domains and brands across batch search results.

    Maintains counting dictionaries for domains and brands encountered during
    batch processing, providing ranked access to the most frequently
    referenced sources. This helps identify authoritative product pages
    vs. aggregator/retailer pages.

    Attributes:
        key: Unique identifier for this cohort (e.g., product category).
        preferred_domain_counts: Domain occurrence counts for ranking.
        preferred_brand_counts: Brand occurrence counts for ranking.

    Example:
        >>> state = _BatchCohortState(key="cat-food", preferred_domain_counts={}, preferred_brand_counts={})
        >>> state.remember_domain("chewy.com")
        >>> state.remember_domain("chewy.com")
        >>> state.remember_brand("Purina")
        >>> state.ranked_domains()
        ['chewy.com']
    """

    key: str
    preferred_domain_counts: dict[str, int]
    preferred_brand_counts: dict[str, int]

    def ranked_domains(self) -> list[str]:
        """Return domains sorted by frequency (descending) then alphabetically.

        Returns:
            List of domain names, most frequently referenced first.
        """
        return [
            domain
            for domain, _count in sorted(
                self.preferred_domain_counts.items(),
                key=lambda item: (-item[1], item[0]),
            )
        ]

    def remember_domain(self, domain: str) -> None:
        """Record a domain reference for cohort ranking.

        Args:
            domain: The domain to record (e.g., "amazon.com").
        """
        if not domain:
            return
        self.preferred_domain_counts[domain] = self.preferred_domain_counts.get(domain, 0) + 1

    def ranked_brands(self) -> list[str]:
        """Return brands sorted by frequency (descending) then alphabetically (case-insensitive).

        Returns:
            List of brand names, most frequently referenced first.
        """
        return [
            brand
            for brand, _count in sorted(
                self.preferred_brand_counts.items(),
                key=lambda item: (-item[1], item[0].lower()),
            )
        ]

    def remember_brand(self, brand: str) -> None:
        """Record a brand reference for cohort ranking.

        Args:
            brand: The brand name to record (normalized via strip).
        """
        normalized_brand = str(brand or "").strip()
        if not normalized_brand:
            return
        self.preferred_brand_counts[normalized_brand] = self.preferred_brand_counts.get(normalized_brand, 0) + 1

    def dominant_domain(self, minimum_count: int = 2) -> str | None:
        """Get the most frequently referenced domain if it meets the threshold.

        Args:
            minimum_count: Minimum occurrences required (default: 2).

        Returns:
            The dominant domain name if it meets minimum_count, else None.
        """
        ranked = self.ranked_domains()
        if not ranked:
            return None
        top_domain = ranked[0]
        if self.preferred_domain_counts.get(top_domain, 0) < minimum_count:
            return None
        return top_domain
