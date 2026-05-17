import logging
from typing import Optional

logger = logging.getLogger("scrapers.ai_search.variant_resolvers")

class BaseVariantResolver:
    """Base class for platform-specific deterministic variant resolvers."""

    def __init__(self, scoring_utils=None, matching_utils=None, extraction_utils=None):
        self.scoring = scoring_utils
        self.matching = matching_utils
        self.extraction = extraction_utils

    async def resolve(
        self,
        *,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
    ) -> tuple[str, Optional[str], Optional[str], str]:
        """Attempt to resolve the exact variant.

        Returns:
            tuple: (resolved_url, resolved_html, resolved_markdown, resolver_status)
            where resolver_status is one of: 'exact_variant', 'family_page_default', 'ambiguous'
        """
        raise NotImplementedError("Subclasses must implement resolve")
