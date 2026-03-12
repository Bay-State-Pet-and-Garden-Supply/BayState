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
    return """Extract structured product data for a single SKU-locked product page.

TARGET CONTEXT
- SKU: {sku}
- Expected Brand (may be null): {brand}
- Expected Product Name: {product_name}

CRITICAL EXTRACTION RULES
1) SKU / VARIANT LOCK (FUZZY VALIDATION)
   - Ensure extracted product refers to the same variant as the target SKU context.
   - Match using fuzzy evidence across: SKU text, size/weight, color, flavor, form-factor terms.
   - Do NOT output data for a different variant from carousel/recommendations.

2) BRAND INFERENCE
   - If Expected Brand is Unknown/null, infer brand from the product title, breadcrumb, manufacturer field, or structured data.
   - Return the canonical brand string (not store name).

3) MUST-FILL CHECKLIST BEFORE FINAL OUTPUT
   - product_name: required
   - images: at least 1 required
   - brand, description, size_metrics, categories: strongly preferred
   - If a required field cannot be found, keep searching the same page context (JSON-LD, meta, visible PDP modules) before giving up.

4) SIZE METRICS EXTRACTION
   - Extract size, weight, volume, or dimensions (e.g., "5 lb bag", "12oz bottle", "24-pack")
   - Look in title, product specs, variant selectors, or packaging information

5) CATEGORIES EXTRACTION
   - Extract product types, categories, or tags (e.g., ["Dog Food", "Dry Food", "Grain-Free"])
   - Look in breadcrumbs, category navigation, product tags, or structured data

6) IMAGE PRIORITIZATION
    - images: Extract ALL high-resolution product image URLs from the image carousel, gallery thumbnails, and JSON-LD structured data blocks.
    - Look carefully for `data-src` attributes, `<script type="application/ld+json">`, and elements with classes like `carousel` or `gallery`.
    - Do not just grab the first image. Return absolute URLs only (https://...).
    - Put primary hero image first, then additional product angles, variants, and detail shots.
    - Exclude sprites, icons, logos, and unrelated recommendation images.
    - DO NOT HALLUCINATE OR INVENT URLS. If you cannot find absolute URLs on the current domain, return an empty list.

7) DESCRIPTION QUALITY
   - Extract meaningful product description/spec text for the exact variant, not generic category copy.

OUTPUT QUALITY BAR
- Return the most complete, variant-accurate record possible.
- Do not hallucinate missing values."""

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

    candidate_name = og_title or twitter_title
    if not candidate_name:
        return None
    if product_name and not matching_utils.is_name_match(product_name, candidate_name):
        return None

    if brand:
        brand_candidate = meta_brand or candidate_name
        if not matching_utils.is_brand_match(brand, brand_candidate, source_url):
            return None

    image_url = og_image or twitter_image
    images = extraction_utils.normalize_images([image_url], source_url) if image_url else []
    if not images:
        return None

    candidate_description = og_description or twitter_description
    return {
        "success": True,
        "product_name": candidate_name,
        "brand": meta_brand or brand,
        "description": candidate_description,
        "size_metrics": extraction_utils.extract_size_metrics(f"{candidate_name} {candidate_description}"),
        "images": images,
        "categories": ["Product"],
        "confidence": 0.8,
        "url": source_url,
    }
