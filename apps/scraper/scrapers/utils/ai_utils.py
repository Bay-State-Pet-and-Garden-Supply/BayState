"""AI Scraper utilities for shared prompt building and browser logic."""

import logging
from pathlib import Path
from typing import Optional, Any

logger = logging.getLogger(__name__)

# Cache for loaded prompts
_PROMPT_CACHE: dict[str, str] = {}

def get_scroll_javascript() -> str:
    """Get JavaScript for lazy loading trigger through scrolling."""
    return """
    async () => {
        // Scroll down to bottom to trigger lazy loading
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Scroll back up
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try to find and interact with carousel elements
        const carousels = document.querySelectorAll('[class*="carousel"], [class*="gallery"], [data-carousel], [role="carousel"]');
        for (const carousel of carousels) {
            carousel.scrollLeft += 200;
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    """

def load_prompt_from_file(version: str) -> Optional[str]:
    """Load prompt template from file with caching."""
    if version in _PROMPT_CACHE:
        return _PROMPT_CACHE[version]

    # Try to load from file: apps/scraper/prompts/
    # This file is in apps/scraper/scrapers/utils/ai_utils.py
    # So parent is utils/, parent.parent is scrapers/, parent.parent.parent is apps/scraper/
    prompts_dir = Path(__file__).parent.parent.parent / "prompts"
    prompt_file = prompts_dir / f"extraction_{version}.txt"

    if prompt_file.exists():
        try:
            content = prompt_file.read_text(encoding="utf-8")
            # Remove comment lines (starting with #)
            lines = [line for line in content.split("\n") if not line.strip().startswith("#")]
            content = "\n".join(lines).strip()
            _PROMPT_CACHE[version] = content
            logger.debug(f"Loaded prompt version {version} from {prompt_file}")
            return content
        except Exception as e:
            logger.warning(f"Failed to load prompt {prompt_file}: {e}")

    return None

def get_hardcoded_prompt() -> str:
    """Return the default hardcoded extraction prompt."""
    return """Extract structured product data for a single product detail page.

TARGET HINTS
- SKU: {sku}
- Expected Brand (soft hint): {brand}
- Expected Product Name (soft hint): {product_name}

CORE POLICY
- Use only evidence from the current page.
- The target hints above are weak hints, not facts. Do not copy them unless the page supports them.
- Extract the exact product or selected variant shown on the page.
- Ignore cross-sells, related items, bundle suggestions, review snippets, shipping copy, and store-wide marketing text.

FIELD RULES
1) product_name
   - Return the clean PDP title for the exact item.
   - Remove store suffixes, price suffixes, and slug noise when possible.
   - Do not return a category name, breadcrumb trail, or retailer name.

2) brand
   - Return the canonical manufacturer brand, not the retailer or site name.
   - Infer from title, manufacturer text, breadcrumb, specs, or structured data.

3) description
   - Return concise product-specific description or spec text for the exact item.
   - Prefer the main description, feature bullets, or product specs.
   - Exclude generic SEO copy, shipping text, and instructions unrelated to the product package.

4) size_metrics
   - Extract package size, count, weight, volume, or product dimensions only.
   - Ignore planting depth, plant spacing, days to maturity, dosage, and other instructional measurements unless they are the package size.

5) images
   - Return absolute product image URLs only.
   - Put the main hero image first, then additional images for the same product.
   - Exclude logos, icons, generic banners, and recommendation images.

6) categories
   - Return 1-4 useful product categories from breadcrumbs, tags, department text, or structured data.
   - Exclude generic crumbs like Home, Shop, Products, Brands, Departments, and the brand name itself.

OUTPUT
- Fill only these schema fields: product_name, brand, description, size_metrics, images, categories.
- Do not hallucinate missing values.
- If a text field cannot be verified, return an empty string.
- If a list field cannot be verified, return []."""

def build_extraction_instruction(sku: str, brand: Optional[str], product_name: Optional[str], prompt_version: str = "v1") -> str:
    """Build the LLM extraction instruction."""
    prompt_template = load_prompt_from_file(prompt_version)

    if prompt_template is None:
        prompt_template = get_hardcoded_prompt()
    else:
        # Handle f-string syntax in prompt files: {brand or "Unknown"} -> {brand}
        # The file uses f-string syntax but we're using .format()
        prompt_template = prompt_template.replace('{brand or "Unknown"}', "{brand}")
        prompt_template = prompt_template.replace('{product_name or "Unknown"}', "{product_name}")

    brand_str = brand if brand else "Unknown"
    product_name_str = product_name if product_name else "Unknown"

    return prompt_template.format(sku=sku, brand=brand_str, product_name=product_name_str)


def compute_meta_confidence(
    *,
    matching_utils,
    candidate_name: str,
    resolved_brand: Optional[str],
    source_url: str,
    product_name: Optional[str],
    brand: Optional[str],
    has_structured_data: bool,
) -> float:
    """Score meta-tag extraction confidence using the same signals as fallback parsing."""
    confidence = 0.65
    if has_structured_data:
        confidence += 0.15
    if product_name and matching_utils.is_name_match(product_name, candidate_name):
        confidence += 0.1
    brand_candidate = resolved_brand or candidate_name
    if brand and matching_utils.is_brand_match(brand, brand_candidate, source_url):
        confidence += 0.1
    return min(confidence, 0.85)


def extract_product_from_meta_tags(
    extraction_utils,
    matching_utils,
    html_text: str,
    source_url: str,
    product_name: Optional[str],
    brand: Optional[str],
) -> Optional[dict[str, Any]]:
    """Extract product data from OpenGraph and Twitter meta tags."""
    if not isinstance(html_text, str):
        return None
        
    og_title = extraction_utils.extract_meta_content(html_text, "og:title", property_attr=True) or ""
    twitter_title = extraction_utils.extract_meta_content(html_text, "twitter:title", property_attr=False) or ""
    og_description = extraction_utils.extract_meta_content(html_text, "og:description", property_attr=True) or ""
    twitter_description = (
        extraction_utils.extract_meta_content(
            html_text,
            "twitter:description",
            property_attr=False,
        )
        or ""
    )
    og_image = extraction_utils.extract_meta_content(html_text, "og:image", property_attr=True) or ""
    twitter_image = extraction_utils.extract_meta_content(html_text, "twitter:image", property_attr=False) or ""
    meta_brand = extraction_utils.extract_meta_content(html_text, "product:brand", property_attr=True) or ""

    candidate_name = extraction_utils.normalize_product_title(og_title or twitter_title)
    if not candidate_name:
        return None
    if product_name and not matching_utils.is_name_match(product_name, candidate_name):
        return None

    candidate_description = extraction_utils.clean_text(og_description or twitter_description)
    resolved_brand = extraction_utils.infer_brand(
        explicit_brand=meta_brand or brand,
        candidate_name=candidate_name,
        description=candidate_description,
        source_url=source_url,
        expected_name=product_name,
    )

    if brand:
        brand_candidate = resolved_brand or candidate_name
        if not matching_utils.is_brand_match(brand, brand_candidate, source_url):
            return None

    image_url = og_image or twitter_image
    images = extraction_utils.normalize_images([image_url], source_url) if image_url else []
    if not images:
        return None

    has_structured_data = bool(og_title or twitter_title or og_description or twitter_description or image_url)
    confidence = compute_meta_confidence(
        matching_utils=matching_utils,
        candidate_name=candidate_name,
        resolved_brand=resolved_brand,
        source_url=source_url,
        product_name=product_name,
        brand=brand,
        has_structured_data=has_structured_data,
    )

    categories = extraction_utils.infer_categories(
        html_text=html_text,
        source_url=source_url,
        candidate_name=candidate_name,
        expected_name=product_name,
        explicit_brand=resolved_brand or brand,
    )
    size_source = f"{candidate_name} {extraction_utils.strip_instructional_copy(candidate_description)}"
    return {
        "success": True,
        "product_name": candidate_name,
        "brand": resolved_brand,
        "description": candidate_description,
        "size_metrics": extraction_utils.extract_size_metrics(size_source),
        "images": images,
        "categories": categories or ["Product"],
        "confidence": confidence,
        "url": source_url,
    }
