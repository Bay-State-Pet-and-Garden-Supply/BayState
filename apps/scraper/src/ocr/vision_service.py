"""OpenAI-compatible Vision LLM OCR Service."""

from __future__ import annotations

import base64
import io
import logging
import os
from typing import Any
import httpx
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Try to load PIL for image resizing
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    logger.warning("Pillow not installed — image resizing for OCR will be unavailable")
    HAS_PIL = False


def resize_image_bytes(image_bytes: bytes, max_dim: int = 1024) -> bytes:
    """Resize image to save on bandwidth and LLM input token count."""
    if not HAS_PIL:
        return image_bytes
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        if width > max_dim or height > max_dim:
            if width > height:
                new_width = max_dim
                new_height = int(height * (max_dim / width))
            else:
                new_height = max_dim
                new_width = int(width * (max_dim / height))
            
            # Preserve aspect ratio and resize
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            out_bytes = io.BytesIO()
            # Default to JPEG if format is not standard
            fmt = img.format if img.format in ("JPEG", "PNG", "WEBP") else "JPEG"
            if img.mode in ("RGBA", "P", "LA") and fmt in ("JPEG", "JPG"):
                img = img.convert("RGB")
            img.save(out_bytes, format=fmt, quality=85)
            return out_bytes.getvalue()
    except Exception as e:
        logger.warning("Failed to resize image for OCR: %s", e)
    return image_bytes


async def fetch_image_as_data_url(url: str) -> str | None:
    """Fetch image and return a base64-encoded data URL."""
    if not isinstance(url, str) or not url.strip():
        return None

    if url.startswith("data:image/"):
        return url

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if not content_type.lower().startswith("image/"):
                import mimetypes
                guess, _ = mimetypes.guess_type(url)
                if guess and guess.startswith("image/"):
                    content_type = guess
                else:
                    logger.warning("OCR fetch: URL %s is not a recognized image: %s", url, content_type)
                    return None
            
            image_bytes = response.content
            # Resize image to save tokens
            resized_bytes = resize_image_bytes(image_bytes)
            
            # Ensure proper content type for data url
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"
                
            base64_data = base64.b64encode(resized_bytes).decode("utf-8")
            return f"data:{content_type};base64,{base64_data}"
    except Exception as e:
        logger.warning("OCR fetch: failed to download/process %s: %s", url, e)
        return None


async def extract_text_from_image_urls(
    image_urls: list[str],
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str = "gpt-4o-mini",
    prompt: str | None = None,
    max_tokens: int = 500,
) -> str:
    """Extract packaging text from product images using a Vision LLM."""
    if not image_urls:
        return ""

    # Resolve API credentials
    resolved_api_key = api_key or os.getenv("LLM_API_KEY")
    resolved_base_url = base_url or os.getenv("LLM_BASE_URL")
    
    if not resolved_api_key:
        logger.warning("No API key available for OCR Vision Service. Skipping OCR.")
        return ""

    # Fetch and prepare images
    data_urls = []
    for url in image_urls:
        data_url = await fetch_image_as_data_url(url)
        if data_url:
            data_urls.append(data_url)
            
    if not data_urls:
        logger.warning("Failed to fetch or process any images for OCR.")
        return ""

    # Default prompt
    default_prompt = (
        "You are an expert product label data extractor. Analyze this product image (which is packaging or a label) "
        "and extract all key information. Format your output as a clean, structured Markdown document. "
        "Use the following structure, omitting sections if no relevant information is present in the image:\n\n"
        "### Product Identity\n"
        "- Name/Title\n"
        "- Brand\n"
        "- Net Weight/Volume\n\n"
        "### Ingredients\n"
        "[Extract the exact ingredients list as printed, preserving order]\n\n"
        "### Guaranteed Analysis / Nutrition Facts\n"
        "[Extract guarantee analysis percentages, nutrition tables, or active ingredients]\n\n"
        "### Feeding Guidelines / Directions for Use\n"
        "[Extract guidelines, usage instructions, or dosage details]\n\n"
        "### Other Information\n"
        "- Warnings/Precautions\n"
        "- Manufacturer info\n"
        "- UPC/barcode numbers if printed\n"
        "- Certifications (e.g. AAFCO statement, organic certificates)\n\n"
        "Do not include any introductory or concluding conversational filler. Start directly with the first section."
    )
    user_prompt = prompt or default_prompt

    # Create AsyncOpenAI client
    client_kwargs: dict[str, Any] = {"api_key": resolved_api_key}
    if resolved_base_url:
        client_kwargs["base_url"] = resolved_base_url
        
    client = AsyncOpenAI(**client_kwargs)

    # Build vision prompt payload
    content: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    for data_url in data_urls:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": data_url,
            }
        })

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": content}
            ],
            max_tokens=max_tokens,
            temperature=0.0,
        )
        extracted_text = str(response.choices[0].message.content or "").strip()
        return extracted_text
    except Exception as e:
        logger.error("OCR vision service API call failed: %s", e)
        return ""
