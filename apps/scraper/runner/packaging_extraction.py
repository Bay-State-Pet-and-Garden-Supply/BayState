"""
Packaging Extraction Runner Module

Processes packaging extraction jobs claimed from the web coordinator:
1. Safely fetches and validates product images
2. Calls a local OpenAI-compatible VLM endpoint for structured packaging data
3. Parses the JSON response (with one repair attempt)
4. Submits the structured result back to the web coordinator

Designed to run inside the BayStateScraper daemon on self-hosted hardware.
The VLM endpoint address is runner-local topology and never exposed to Vercel/web.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import ipaddress
import json
import logging
import os
import socket
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PACKAGING_EXTRACTION_JOB_TYPE = "packaging_extraction"

DEFAULT_PROMPT_VERSION = "packaging-title-v1"
DEFAULT_SCHEMA_VERSION = "packaging-extraction-v1"
VLM_TIMEOUT_SECONDS = 90
IMAGE_FETCH_TIMEOUT_SECONDS = 30
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGES_PER_PRODUCT = 2

# Default prompt sent to the VLM
VLM_EXTRACTION_PROMPT = """Analyze this product packaging image. Extract all key information visible on the label.

Return ONLY a JSON object with this exact structure, no extra text:
{
  "raw_text": "all visible text from the packaging",
  "facts": {
    "packaging_title": "the product name/line as printed on packaging",
    "brand": "brand name",
    "product_line": "product line or series name if present",
    "variant": "variant description if present (e.g. 'Chicken & Brown Rice Recipe')",
    "flavor": "flavor if indicated",
    "color": "color if indicated",
    "scent": "scent if indicated",
    "material": "material if indicated",
    "product_type": "product type descriptor (e.g. 'Dry Dog Food', 'Lawn Fertilizer')",
    "size": "size if indicated",
    "weight": "net weight/volume as printed",
    "count": "count or quantity if indicated",
    "packaging_type": "type of packaging (e.g. 'bag', 'bottle', 'box', 'can')",
    "claims": []
  },
  "field_confidence": {
    "brand": 0.0-1.0,
    "packaging_title": 0.0-1.0,
    "product_line": 0.0-1.0,
    "variant": 0.0-1.0,
    "flavor": 0.0-1.0,
    "color": 0.0-1.0,
    "scent": 0.0-1.0,
    "material": 0.0-1.0,
    "product_type": 0.0-1.0,
    "size": 0.0-1.0,
    "weight": 0.0-1.0,
    "count": 0.0-1.0
  },
  "overall_confidence": 0.0-1.0,
  "notes": []
}

Rules for Extraction:
1. Weight: Extract ONLY the numerical weight value and its unit (e.g., "7 OZ", "25 lb.", "10 lbs"). Do NOT include prefix labels like "NET WT.", "Net Weight", or "Net Wt." in the weight value.
2. Packaging Type: Limit to standard structural types: 'bag', 'pouch', 'can', 'box', 'bottle', 'jug', 'tub', 'jar', 'tray', 'wrapper', 'carded', or 'bulk'. Do NOT put marketing claims (e.g. "MADE IN USA") or country of origin here.
3. Brand Logo/Spelling: Carefully inspect the logo. Correct common character dropouts in stylized fonts (e.g., stylized "WHOLESOMES" might look like "WHOLESMES" at a glance; verify standard English brand names).
4. Semantic Segments: Do NOT duplicate the brand name in the packaging_title. The packaging_title should be the primary product name (e.g., "CHEWY Mini Sticks"), and flavor details should be placed in 'flavor' or 'variant'.

Set confidence to 0.0 for fields not visible or uncertain.
Overall_confidence should reflect how readable and interpretable the image is.
Include any uncertainty or quality issues in notes."""

# Prompt used exclusively for OCR-only raw text extraction (no JSON)
OCR_ONLY_PROMPT = (
    "Extract all visible text from this product packaging image. "
    "Preserve line breaks and text hierarchy. "
    "Do not summarize or describe the image. "
    "Return ONLY the extracted text, nothing else."
)

# Prompt template for the text-only LLM to structure raw OCR text into JSON
# The caller formats it with the raw OCR output
STRUCTURE_FROM_OCR_PROMPT_TEMPLATE = (
    "Here is raw text extracted from a product packaging image via OCR. "
    "Convert it into the following structured JSON format. "
    "Only include fields with clear evidence in the raw text. "
    "Do not guess or hallucinate values that are not visible in the raw text.\n\n"
    "RAW OCR TEXT:\n"
    "{raw_ocr_text}\n\n"
    "Return ONLY a JSON object with this exact structure, no extra text:\n"
    '{{\n'
    '  "facts": {{\n'
    '    "packaging_title": "the product name/line as it appears on packaging",\n'
    '    "brand": "brand name",\n'
    '    "product_line": "product line or series name",\n'
    '    "variant": "variant description if present",\n'
    '    "flavor": "flavor if indicated",\n'
    '    "color": "color if indicated",\n'
    '    "scent": "scent if indicated",\n'
    '    "material": "material if indicated",\n'
    '    "product_type": "product type descriptor",\n'
    '    "size": "size if indicated",\n'
    '    "weight": "net weight/volume as printed",\n'
    '    "count": "count or quantity if indicated",\n'
    '    "packaging_type": "type of packaging",\n'
    '    "claims": []\n'
    '  }},\n'
    '  "field_confidence": {{\n'
    '    "brand": 0.0-1.0,\n'
    '    "packaging_title": 0.0-1.0,\n'
    '    "product_line": 0.0-1.0,\n'
    '    "variant": 0.0-1.0,\n'
    '    "flavor": 0.0-1.0,\n'
    '    "color": 0.0-1.0,\n'
    '    "scent": 0.0-1.0,\n'
    '    "material": 0.0-1.0,\n'
    '    "product_type": 0.0-1.0,\n'
    '    "size": 0.0-1.0,\n'
    '    "weight": 0.0-1.0,\n'
    '    "count": 0.0-1.0\n'
    '  }},\n'
    '  "overall_confidence": 0.0-1.0,\n'
    '  "notes": []\n'
    '}}\n'
    'Rules for Structuring:\n'
    '1. Weight: Extract ONLY the numerical weight value and its unit (e.g., "7 OZ", "25 lb.", "10 lbs"). Do NOT include prefix labels like "NET WT.", "Net Weight", or "Net Wt." in the weight value.\n'
    '2. Packaging Type: Limit to standard structural types: \'bag\', \'pouch\', \'can\', \'box\', \'bottle\', \'jug\', \'tub\', \'jar\', \'tray\', \'wrapper\', \'carded\', or \'bulk\'. Do NOT use marketing claims or taglines.\n'
    '3. Brand Logo/Spelling: Verify spelling carefully. Correct obvious OCR dropout errors (e.g., "WHOLESMES" -> "WHOLESOMES").\n'
    '4. Semantic Segments: Do NOT duplicate the brand name in the packaging_title. Ensure primary product name is in packaging_title and sub-variants/flavors are in variant/flavor.\n\n'
    'Set confidence to 0.0 for fields not visible or uncertain.\n'
    'Overall_confidence should reflect how readable and interpretable the OCR output is.'
)

DEFAULT_OCR_PROMPT_VERSION = "packaging-ocr-then-parse-v1"

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass
class PackagingExtractionResult:
    """Result of a packaging extraction job, ready to submit back to coordinator."""

    status: str  # succeeded | failed | timed_out | skipped_no_images
    upc: str
    raw_text: str | None = None
    structured_facts: dict[str, Any] = field(default_factory=dict)
    field_confidence: dict[str, float] = field(default_factory=dict)
    overall_confidence: float = 0.0
    image_urls: list[str] = field(default_factory=list)
    image_fingerprints: list[str] = field(default_factory=list)
    image_metadata: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    error_message: str | None = None
    prompt_version: str = DEFAULT_PROMPT_VERSION
    schema_version: str = DEFAULT_SCHEMA_VERSION
    provider: str = "local_vlm"
    model: str = "unknown"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    hostname: str | None = None


# ---------------------------------------------------------------------------
# Safe Image Fetching
# ---------------------------------------------------------------------------

_PRIVATE_IP_PREFIXES = (
    "127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
    "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
    "172.30.", "172.31.", "192.168.", "0.", "169.254.",
    "100.64.", "100.65.", "100.66.", "100.67.", "100.68.",
    "100.69.", "100.70.", "100.71.", "100.72.", "100.73.",
    "100.74.", "100.75.", "100.76.", "100.77.", "100.78.",
    "100.79.", "100.80.", "100.81.", "100.82.", "100.83.",
    "100.84.", "100.85.", "100.86.", "100.87.", "100.88.",
    "100.89.", "100.90.", "100.91.", "100.92.", "100.93.",
    "100.94.", "100.95.", "100.96.", "100.97.", "100.98.",
    "100.99.", "100.100.", "100.101.", "100.102.", "100.103.",
    "100.104.", "100.105.", "100.106.", "100.107.", "100.108.",
    "100.109.", "100.110.", "100.111.", "100.112.", "100.113.",
    "100.114.", "100.115.", "100.116.", "100.117.", "100.118.",
    "100.119.", "100.120.", "100.121.", "100.122.", "100.123.",
    "100.124.", "100.125.", "100.126.", "100.127.",
)

_RESERVED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
}


def _is_private_ip(hostname: str) -> bool:
    """Check if a hostname is a private/reserved IP address.
    Uses Python's ipaddress module for robust IPv4 and IPv6 validation.
    """
    hostname = hostname.strip().lower()
    if hostname.startswith("[") and hostname.endswith("]"):
        hostname = hostname[1:-1]
    if hostname in _RESERVED_HOSTNAMES:
        return True
    try:
        addr = ipaddress.ip_address(hostname)
        return addr.is_private or addr.is_reserved or addr.is_loopback or addr.is_multicast or addr.is_link_local or addr.is_unspecified
    except ValueError:
        pass
    return hostname.startswith(_PRIVATE_IP_PREFIXES)


def _detect_image_mime(data: bytes) -> str | None:
    """Detect image MIME type from magic bytes."""
    if len(data) < 4:
        return None
    if data[0:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[0:4] == b"\x89PNG":
        return "image/png"
    if data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[0:4] == b"GIF8":
        return "image/gif"
    return None


def _resize_image_bytes(image_bytes: bytes, max_dim: int = 1024) -> bytes:
    """Resize image to reduce VLM input tokens."""
    try:
        from PIL import Image
    except ImportError:
        return image_bytes

    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        if width <= max_dim and height <= max_dim:
            return image_bytes

        if width > height:
            new_width = max_dim
            new_height = int(height * (max_dim / width))
        else:
            new_height = max_dim
            new_width = int(width * (max_dim / height))

        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        fmt = img.format if img.format in ("JPEG", "PNG", "WEBP") else "JPEG"
        if img.mode in ("RGBA", "P", "LA") and fmt == "JPEG":
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format=fmt, quality=85)
        return out.getvalue()
    except Exception as e:
        logger.warning("Image resize failed: %s", e)
        return image_bytes


async def _fetch_image_safe(url: str) -> dict[str, Any]:
    """Fetch a single image URL with SSRF-safe validation.

    Returns dict with keys: url, data, mime_type, sha256, width, height, bytes, error
    On failure error is a string; on success error is None.
    """
    result: dict[str, Any] = {"url": url, "error": None}

    # Basic URL validation
    if not url.startswith(("http://", "https://")):
        result["error"] = "Only http/https URLs allowed"
        return result

    try:
        parsed = urlparse(url)
    except Exception as e:
        result["error"] = f"Invalid URL: {e}"
        return result

    hostname = parsed.hostname or ""

    # Reject localhost and private IPs
    if hostname.lower() in _RESERVED_HOSTNAMES:
        result["error"] = "Blocked: reserved hostname"
        return result

    # Quick private IP check by hostname string
    if _is_private_ip(hostname):
        result["error"] = "Blocked: private/reserved IP"
        return result

    # DNS resolution check for domain names — check both IPv4 and IPv6
    def _is_resolved_ip_private(host: str) -> bool:
        """Check if a resolved IP address is private/reserved."""
        if _is_private_ip(host):
            return True
        try:
            addr = ipaddress.ip_address(host)
            return addr.is_private or addr.is_reserved or addr.is_loopback or addr.is_multicast or addr.is_link_local or addr.is_unspecified
        except ValueError:
            return False

    try:
        addrs_v4 = await asyncio.get_event_loop().getaddrinfo(hostname, 80, family=socket.AF_INET)
        for addr in addrs_v4:
            ip = addr[4][0]
            if _is_resolved_ip_private(ip):
                result["error"] = f"Blocked: domain resolves to private IPv4 ({ip})"
                return result
    except Exception:
        # IPv4 resolution failure - not automatically fatal, try IPv6
        pass

    try:
        addrs_v6 = await asyncio.get_event_loop().getaddrinfo(hostname, 80, family=socket.AF_INET6)
        for addr in addrs_v6:
            ip = addr[4][0]
            if _is_resolved_ip_private(ip):
                result["error"] = f"Blocked: domain resolves to private IPv6 ({ip})"
                return result
    except Exception:
        pass

    if not addrs_v4 and not addrs_v6:
        result["error"] = "Blocked: DNS resolution failed"
        return result

    # Fetch with timeout — disable automatic redirects, re-validate each hop
    async def _fetch_with_redirect_validation(fetch_url: str, max_redirects: int = 5) -> httpx.Response | None:
        """Fetch a URL, manually following redirects and validating each hop."""
        current_url = fetch_url
        for hop in range(max_redirects + 1):
            # Validate the current target URL
            try:
                parsed_current = urlparse(current_url)
                current_host = parsed_current.hostname or ""
                if current_host.lower() in _RESERVED_HOSTNAMES or _is_private_ip(current_host):
                    result["error"] = f"Blocked: redirect target {current_host} is private"
                    return None
                # DNS check for redirect targets
                try:
                    redirect_addrs = await asyncio.get_event_loop().getaddrinfo(current_host, 80, family=socket.AF_INET)
                    for ra in redirect_addrs:
                        rip = ra[4][0]
                        if _is_resolved_ip_private(rip):
                            result["error"] = f"Blocked: redirect {current_url} resolves to private IP ({rip})"
                            return None
                except Exception:
                    result["error"] = f"Blocked: redirect target DNS resolution failed for {current_host}"
                    return None
            except Exception as e:
                result["error"] = f"Blocked: invalid redirect URL {current_url}: {e}"
                return None

            async with httpx.AsyncClient(timeout=IMAGE_FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
                response = await client.get(current_url, headers={"Accept": "image/*"})

            if 300 <= response.status_code < 400:
                location = response.headers.get("location")
                if not location:
                    result["error"] = f"Redirect {response.status_code} with no Location header"
                    return None
                current_url = str(urlparse(location)._replace(scheme=urlparse(current_url).scheme or "https")) \
                    if not location.startswith(("http://", "https://")) else location
                continue

            return response

        result["error"] = f"Too many redirects ({max_redirects})"
        return None

    response = await _fetch_with_redirect_validation(url)

    if response is None:
        # Error already set in result by _fetch_with_redirect_validation
        return result

    # Content-Type check
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if not content_type.startswith("image/"):
        # Check magic bytes anyway
        data = response.content
        detected = _detect_image_mime(data)
        if not detected:
            result["error"] = f"Rejected non-image content: {content_type}"
            return result
        content_type = detected
    else:
        data = response.content

    # Size limit
    if len(data) > MAX_IMAGE_BYTES:
        result["error"] = f"Image too large: {len(data)} bytes (max {MAX_IMAGE_BYTES})"
        return result

    # Magic byte validation
    detected_mime = _detect_image_mime(data)
    if not detected_mime:
        result["error"] = "Content does not match any recognized image format"
        return result

    # Resize
    resized = _resize_image_bytes(data)

    # Compute SHA-256 fingerprint
    sha256 = hashlib.sha256(resized).hexdigest()

    result["data"] = resized
    result["mime_type"] = detected_mime
    result["sha256"] = sha256
    result["bytes"] = len(resized)

    # Get dimensions from PIL if available
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(resized))
        result["width"] = img.width
        result["height"] = img.height
    except ImportError:
        result["width"] = 0
        result["height"] = 0

    return result


# ---------------------------------------------------------------------------
# Generic OpenAI-Compatible Call
# ---------------------------------------------------------------------------


async def _call_completion(
    *,
    base_url: str,
    model: str,
    api_key: str,
    messages: list[dict[str, Any]],
    max_tokens: int = 1000,
    temperature: float = 0.0,
    timeout_seconds: int = 90,
) -> dict[str, Any]:
    """Call any OpenAI-compatible endpoint and return raw text + usage.

    Returns dict with keys: success, text, error, usage.
    """
    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout_seconds,
        )
        raw_text = (response.choices[0].message.content or "").strip()
        usage = {
            "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) or 0,
            "completion_tokens": getattr(response.usage, "completion_tokens", 0) or 0,
            "total_tokens": getattr(response.usage, "total_tokens", 0) or 0,
        }
        if not raw_text:
            return {"success": False, "error": "Empty response", "text": "", "usage": usage}
        return {"success": True, "text": raw_text, "usage": usage}
    except Exception as e:
        return {"success": False, "error": f"API call failed: {e}", "text": "", "usage": {}}


# ---------------------------------------------------------------------------
# VLM Call (Structured Mode)
# ---------------------------------------------------------------------------


def _get_vlm_env() -> dict[str, Any]:
    """Load vision VLM env configuration."""
    return {
        "base_url": os.environ.get(
            "PACKAGING_VISION_BASE_URL",
            "http://127.0.0.1:11434/v1",
        ),
        "model": os.environ.get(
            "PACKAGING_VISION_MODEL",
            "qwen2.5vl",
        ),
        "api_key": os.environ.get(
            "PACKAGING_VISION_API_KEY",
            "not-needed",
        ),
        "timeout": int(os.environ.get("PACKAGING_VISION_TIMEOUT_SECONDS", "90")),
    }


def _get_text_env() -> dict[str, Any]:
    """Load text-only LLM env configuration."""
    vision_base = os.environ.get("PACKAGING_VISION_BASE_URL", "http://127.0.0.1:11434/v1")
    return {
        "base_url": os.environ.get("PACKAGING_TEXT_BASE_URL", vision_base),
        "model": os.environ.get("PACKAGING_TEXT_MODEL", "llama3.2:3b"),
        "api_key": os.environ.get("PACKAGING_TEXT_API_KEY", "ollama"),
        "timeout": int(os.environ.get("PACKAGING_TEXT_TIMEOUT_SECONDS", "120")),
    }


async def _call_vlm(
    image_data_urls: list[str],
    prompt: str,
) -> dict[str, Any]:
    """Call a local OpenAI-compatible VLM endpoint and return parsed JSON.

    Used by the structured_vlm pipeline (direct image-to-JSON).
    Returns dict with keys: success, data (parsed JSON), error, usage, raw_text.
    """
    env = _get_vlm_env()

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for data_url in image_data_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": data_url},
        })

    result = await _call_completion(
        base_url=env["base_url"],
        model=env["model"],
        api_key=env["api_key"],
        messages=[{"role": "user", "content": content}],
        max_tokens=1000,
        temperature=0.0,
        timeout_seconds=env["timeout"],
    )

    if not result["success"]:
        return {"success": False, "error": result["error"], "usage": result["usage"]}

    raw_text = result["text"]
    usage = result["usage"]

    # Try to parse JSON
    try:
        data = json.loads(raw_text)
        return {"success": True, "data": data, "raw_text": raw_text, "usage": usage}
    except json.JSONDecodeError:
        # One repair attempt: extract JSON from markdown code block
        repaired = _repair_json(raw_text)
        if repaired:
            try:
                data = json.loads(repaired)
                return {
                    "success": True,
                    "data": data,
                    "raw_text": raw_text,
                    "usage": usage,
                    "notes": ["JSON repaired from markdown block"],
                }
            except json.JSONDecodeError:
                pass

        return {
            "success": False,
            "error": f"Invalid JSON from VLM: {raw_text[:500]}",
            "raw_text": raw_text,
            "usage": usage,
        }


# ---------------------------------------------------------------------------
# Two-Stage Pipeline Helpers (ocr_then_parse mode)
# ---------------------------------------------------------------------------


async def _call_vision_ocr(image_data_urls: list[str]) -> dict[str, Any]:
    """Stage 1: Call VLM with OCR_ONLY_PROMPT to extract raw packaging text.

    Returns dict with keys: success, text, error, usage.
    """
    env = _get_vlm_env()

    content: list[dict[str, Any]] = [{"type": "text", "text": OCR_ONLY_PROMPT}]
    for data_url in image_data_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": data_url},
        })

    return await _call_completion(
        base_url=env["base_url"],
        model=env["model"],
        api_key=env["api_key"],
        messages=[{"role": "user", "content": content}],
        max_tokens=2048,
        temperature=0.0,
        timeout_seconds=env["timeout"],
    )


async def _call_text_structurer(raw_ocr_text: str) -> dict[str, Any]:
    """Stage 2: Call text-only LLM to convert raw OCR text into structured JSON.

    Returns dict with keys: success, data (parsed JSON), text, error, usage.
    On failure with valid raw OCR, returns (success=False, text=raw_ocr_text).
    """
    env = _get_text_env()
    prompt = STRUCTURE_FROM_OCR_PROMPT_TEMPLATE.format(raw_ocr_text=raw_ocr_text)

    result = await _call_completion(
        base_url=env["base_url"],
        model=env["model"],
        api_key=env["api_key"],
        messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        max_tokens=1500,
        temperature=0.0,
        timeout_seconds=env["timeout"],
    )

    if not result["success"]:
        return {"success": False, "error": result["error"], "text": raw_ocr_text, "usage": result["usage"]}

    text = result["text"]
    usage = result["usage"]

    # Try to parse JSON
    try:
        data = json.loads(text)
        return {"success": True, "data": data, "text": text, "usage": usage}
    except json.JSONDecodeError:
        repaired = _repair_json(text)
        if repaired:
            try:
                data = json.loads(repaired)
                return {
                    "success": True,
                    "data": data,
                    "text": text,
                    "usage": usage,
                    "notes": ["JSON repaired from markdown block"],
                }
            except json.JSONDecodeError:
                pass

        return {
            "success": False,
            "error": f"Text structurer returned invalid JSON: {text[:300]}",
            "text": raw_ocr_text,
            "usage": usage,
            "notes": ["Structuring failed; raw OCR retained"],
        }


def _repair_json(text: str) -> str | None:
    """Attempt to extract a JSON object from text that might be wrapped in markdown."""
    stripped = text.strip()
    # Try ```json ... ``` block
    if "```json" in stripped:
        start = stripped.find("```json") + 7
        end = stripped.find("```", start)
        if end > start:
            return stripped[start:end].strip()
    # Try ```...``` block (language-agnostic)
    if stripped.startswith("```"):
        first_newline = stripped.find("\n")
        end = stripped.rfind("```")
        if end > first_newline > 0:
            candidate = stripped[first_newline + 1:end].strip()
            if candidate.startswith("{") and candidate.endswith("}"):
                return candidate
    # Try direct extraction: find first { and last }
    brace_start = stripped.find("{")
    brace_end = stripped.rfind("}")
    if brace_end > brace_start >= 0:
        candidate = stripped[brace_start:brace_end + 1]
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass
    return None


# ---------------------------------------------------------------------------
# Image Preparation
# ---------------------------------------------------------------------------


async def _prepare_images(
    image_urls: list[str],
    max_images: int = 2,
) -> tuple[list[str], list[str], list[dict[str, Any]], list[str]]:
    """Fetch, validate, resize, and prepare images for VLM.

    Returns:
        (data_urls, fingerprints, metadata, errors)
    """
    data_urls: list[str] = []
    fingerprints: list[str] = []
    metadata: list[dict[str, Any]] = []
    errors: list[str] = []

    for url in image_urls[:max_images]:
        result = await _fetch_image_safe(url)
        if result.get("error"):
            errors.append(f"{url}: {result['error']}")
            continue
        if result.get("data"):
            data_bytes = result["data"]
            mime = result["mime_type"]
            b64 = base64.b64encode(data_bytes).decode("utf-8")
            data_url = f"data:{mime};base64,{b64}"
            data_urls.append(data_url)
            fingerprints.append(result.get("sha256", ""))
            metadata.append({
                "source_url": url,
                "sha256": result.get("sha256", ""),
                "mime_type": mime,
                "bytes": result.get("bytes", 0),
                "width": result.get("width", 0),
                "height": result.get("height", 0),
            })

    return data_urls, fingerprints, metadata, errors


# ---------------------------------------------------------------------------
# Result Construction
# ---------------------------------------------------------------------------


def _build_result(
    upc: str,
    status: str,
    vlm_data: dict[str, Any] | None = None,
    *,
    error_message: str | None = None,
    image_urls: list[str] | None = None,
    fingerprints: list[str] | None = None,
    image_metadata: list[dict[str, Any]] | None = None,
    prep_errors: list[str] | None = None,
    notes: list[str] | None = None,
    model_name: str | None = None,
    prompt_version: str | None = None,
    usage_override: dict[str, int] | None = None,
) -> PackagingExtractionResult:
    """Build a PackagingExtractionResult from VLM output.

    Args:
        upc: Product UPC.
        status: Result status.
        vlm_data: Response dict from _call_vlm or _call_text_structurer.
                   Expected keys: success, data, raw_text/text, usage, notes.
        model_name: Override the model name (default: PACKAGING_VISION_MODEL env).
        prompt_version: Override prompt version (default: DEFAULT_PROMPT_VERSION).
        usage_override: Override token usage counts.
    """
    all_notes: list[str] = notes or []
    if prep_errors:
        all_notes.extend(prep_errors)

    if vlm_data and vlm_data.get("success"):
        data = vlm_data.get("data", {})
        facts = data.get("facts", {}) if isinstance(data, dict) else {}
        confidence = data.get("field_confidence", {}) if isinstance(data, dict) else {}
        # Handle both _call_vlm output (raw_text) and _call_text_structurer output (text)
        raw_text = vlm_data.get("raw_text") or vlm_data.get("text") or (data.get("raw_text") if isinstance(data, dict) else None)
        vlm_notes = data.get("notes", []) if isinstance(data, dict) else vlm_data.get("notes", [])
        if isinstance(vlm_notes, list):
            all_notes.extend(vlm_notes)

        usage = usage_override or vlm_data.get("usage", {})
        resolved_model = model_name or os.environ.get("PACKAGING_VISION_MODEL", "unknown")
        resolved_prompt_version = prompt_version or DEFAULT_PROMPT_VERSION
        hostname = os.environ.get("RUNNER_NAME") or os.environ.get("HOSTNAME")

        return PackagingExtractionResult(
            status="succeeded",
            upc=upc,
            raw_text=raw_text or "",
            structured_facts=facts if isinstance(facts, dict) else {},
            field_confidence=confidence if isinstance(confidence, dict) else {},
            overall_confidence=(
                float(data.get("overall_confidence", 0.0))
                if isinstance(data, dict) else 0.0
            ),
            image_urls=image_urls or [],
            image_fingerprints=fingerprints or [],
            image_metadata=image_metadata or [],
            notes=all_notes,
            provider="local_vlm",
            model=resolved_model,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            hostname=hostname,
            prompt_version=resolved_prompt_version,
            schema_version=DEFAULT_SCHEMA_VERSION,
        )
    else:
        vlm_error = vlm_data.get("error", "Unknown VLM error") if vlm_data else "No VLM data"
        return PackagingExtractionResult(
            status="failed" if not error_message else status,
            upc=upc,
            error_message=error_message or vlm_error,
            image_urls=image_urls or [],
            image_fingerprints=fingerprints or [],
            image_metadata=image_metadata or [],
            notes=all_notes,
            prompt_version=DEFAULT_PROMPT_VERSION,
            schema_version=DEFAULT_SCHEMA_VERSION,
        )


# ---------------------------------------------------------------------------
# Main Job Function
# ---------------------------------------------------------------------------


async def _run_packaging_extraction_job(
    attempt: Any,
    runner_name: str | None = None,
    log_buffer: list[dict[str, Any]] | None = None,
    progress_callback: Any | None = None,
    api_client: Any | None = None,
    job_logging: Any | None = None,
) -> dict[str, Any]:
    """Execute a single packaging extraction job.

    Flow:
    1. Load job payload (image URLs, prompt version)
    2. Safely fetch, validate, and resize images
    3. Call local VLM endpoint
    4. Parse JSON response
    5. Submit result back to web coordinator
    6. Return results dict
    """
    extraction_id = getattr(attempt, "extraction_id", "") or ""
    upc = getattr(attempt, "upc", "") or ""
    image_urls = getattr(attempt, "image_urls", []) or []
    prompt_version = getattr(attempt, "prompt_version", DEFAULT_PROMPT_VERSION)
    schema_version = getattr(attempt, "schema_version", DEFAULT_SCHEMA_VERSION)
    max_images = getattr(attempt, "max_images", MAX_IMAGES_PER_PRODUCT)
    lease_token = getattr(attempt, "lease_token", None)

    results: dict[str, Any] = {
        "upcs_processed": 0,
        "extractions_run": ["packaging_extraction"],
        "data": {},
    }

    if log_buffer is None:
        log_buffer = []

    if not extraction_id or not upc:
        error_msg = "Packaging extraction job missing extraction_id or upc"
        logger.error(error_msg)
        results["error_message"] = error_msg
        results["logs"] = log_buffer
        return results

    logger.info(
        "Processing packaging extraction %s for UPC %s (%d images)",
        extraction_id, upc, len(image_urls),
        extra={
            "job_id": extraction_id,
            "runner_name": runner_name,
            "phase": "starting",
            "upc": upc,
        },
    )

    # Emit progress
    if job_logging and hasattr(job_logging, "emit_progress"):
        job_logging.emit_progress(
            status="running",
            progress=0,
            message=f"Packaging extraction started for UPC {upc}",
            phase="fetching_images",
            details={"extraction_id": extraction_id, "upc": upc, "image_count": len(image_urls)},
            items_total=1,
        )

    start_time = time.time()

    # 1. Prepare images
    if not image_urls:
        # No images to process — mark as skipped
        _submit_extraction_result(
            api_client=api_client,
            extraction_id=extraction_id,
            result=PackagingExtractionResult(
                status="skipped_no_images",
                upc=upc,
                notes=["No image URLs provided in job payload"],
                prompt_version=prompt_version,
                schema_version=schema_version,
            ),
            lease_token=lease_token,
        )
        results["upcs_processed"] = 0
        results["data"][upc] = {"status": "skipped_no_images"}
        results["logs"] = log_buffer
        return results

    data_urls, fingerprints, image_metadata, prep_errors = await _prepare_images(
        image_urls, max_images=max_images,
    )

    if not data_urls:
        # All images failed to fetch
        error_msg = "; ".join(prep_errors) if prep_errors else "No usable images"
        _submit_extraction_result(
            api_client=api_client,
            extraction_id=extraction_id,
            result=PackagingExtractionResult(
                status="failed",
                upc=upc,
                error_message=f"Image preparation failed: {error_msg}",
                image_urls=image_urls,
                image_fingerprints=fingerprints,
                image_metadata=image_metadata,
                notes=prep_errors,
                prompt_version=prompt_version,
                schema_version=schema_version,
            ),
            lease_token=lease_token,
        )
        results["upcs_processed"] = 0
        results["data"][upc] = {
            "status": "failed",
            "error": error_msg,
        }
        results["logs"] = log_buffer
        return results

    # 2. Determine pipeline mode and call VLM/text models
    pipeline = os.environ.get("PACKAGING_VISION_PIPELINE", "ocr_then_parse").lower()

    if job_logging and hasattr(job_logging, "emit_progress"):
        job_logging.emit_progress(
            status="running",
            progress=50,
            message=f"Calling VLM ({pipeline}) for {len(data_urls)} image(s)",
            phase="vlm_call",
            details={"extraction_id": extraction_id, "image_count": len(data_urls), "pipeline": pipeline},
            items_total=1,
        )

    if pipeline == "structured_vlm":
        # Existing behavior: send images + structured JSON prompt to vision model directly
        logger.info(
            "Using structured VLM pipeline for extraction %s (UPC %s)",
            extraction_id, upc,
        )
        vlm_result = await _call_vlm(data_urls, VLM_EXTRACTION_PROMPT)

        result = _build_result(
            upc=upc,
            status="succeeded" if vlm_result.get("success") else "failed",
            vlm_data=vlm_result,
            error_message=vlm_result.get("error"),
            image_urls=image_urls,
            fingerprints=fingerprints,
            image_metadata=image_metadata,
            prep_errors=prep_errors,
            notes=None,
        )
        result.prompt_version = prompt_version
        result.schema_version = schema_version

    else:
        # ocr_then_parse: two-stage pipeline
        vision_model = os.environ.get("PACKAGING_VISION_MODEL", "glm-ocr")
        text_model = os.environ.get("PACKAGING_TEXT_MODEL", "llama3.2:3b")
        logger.info(
            "Using OCR-then-parse pipeline for extraction %s (UPC %s) — vision=%s text=%s",
            extraction_id, upc, vision_model, text_model,
        )

        # Stage 1: OCR-only vision call
        ocr_result = await _call_vision_ocr(data_urls)

        if not ocr_result.get("success"):
            # OCR itself failed
            logger.warning(
                "OCR stage failed for extraction %s (UPC %s): %s",
                extraction_id, upc, ocr_result.get("error"),
            )
            vlm_result = {"success": False, "error": ocr_result.get("error"), "usage": ocr_result.get("usage")}
            result = _build_result(
                upc=upc,
                status="failed",
                vlm_data=vlm_result,
                error_message=f"OCR stage failed: {ocr_result.get('error')}",
                image_urls=image_urls,
                fingerprints=fingerprints,
                image_metadata=image_metadata,
                prep_errors=prep_errors,
            )
            result.prompt_version = DEFAULT_OCR_PROMPT_VERSION
            result.schema_version = schema_version
            result.model = vision_model
        else:
            raw_ocr_text = ocr_result.get("text", "")
            if not raw_ocr_text:
                logger.warning(
                    "OCR stage returned empty text for extraction %s (UPC %s)",
                    extraction_id, upc,
                )
                result = PackagingExtractionResult(
                    status="failed",
                    upc=upc,
                    error_message="OCR stage returned empty text",
                    image_urls=image_urls,
                    image_fingerprints=fingerprints,
                    image_metadata=image_metadata,
                    notes=["OCR returned no visible text from images"],
                    prompt_version=DEFAULT_OCR_PROMPT_VERSION,
                    schema_version=schema_version,
                    model=vision_model,
                    prompt_tokens=ocr_result.get("usage", {}).get("prompt_tokens", 0),
                    completion_tokens=ocr_result.get("usage", {}).get("completion_tokens", 0),
                    total_tokens=ocr_result.get("usage", {}).get("total_tokens", 0),
                )
            else:
                # Stage 2: Text structuring
                struct_result = await _call_text_structurer(raw_ocr_text)

                # Merge usage from both stages
                combined_usage = {
                    "prompt_tokens": (
                        ocr_result.get("usage", {}).get("prompt_tokens", 0)
                        + struct_result.get("usage", {}).get("prompt_tokens", 0)
                    ),
                    "completion_tokens": (
                        ocr_result.get("usage", {}).get("completion_tokens", 0)
                        + struct_result.get("usage", {}).get("completion_tokens", 0)
                    ),
                    "total_tokens": (
                        ocr_result.get("usage", {}).get("total_tokens", 0)
                        + struct_result.get("usage", {}).get("total_tokens", 0)
                    ),
                }

                if struct_result.get("success"):
                    # Both stages succeeded
                    result = _build_result(
                        upc=upc,
                        status="succeeded",
                        vlm_data=struct_result,
                        image_urls=image_urls,
                        fingerprints=fingerprints,
                        image_metadata=image_metadata,
                        prep_errors=prep_errors,
                        model_name=f"{vision_model} + {text_model}",
                        prompt_version=DEFAULT_OCR_PROMPT_VERSION,
                        usage_override=combined_usage,
                    )
                    result.schema_version = schema_version
                else:
                    # OCR succeeded but structuring failed — preserve raw text
                    result = PackagingExtractionResult(
                        status="succeeded",
                        upc=upc,
                        raw_text=raw_ocr_text,
                        structured_facts={},
                        field_confidence={},
                        overall_confidence=0.3,
                        image_urls=image_urls,
                        image_fingerprints=fingerprints,
                        image_metadata=image_metadata,
                        notes=["Text structuring failed; raw OCR retained"],
                        provider="local_vlm",
                        model=f"{vision_model} + {text_model}",
                        prompt_tokens=combined_usage.get("prompt_tokens", 0),
                        completion_tokens=combined_usage.get("completion_tokens", 0),
                        total_tokens=combined_usage.get("total_tokens", 0),
                        hostname=os.environ.get("RUNNER_NAME") or os.environ.get("HOSTNAME"),
                        prompt_version=DEFAULT_OCR_PROMPT_VERSION,
                        schema_version=schema_version,
                    )

    elapsed = time.time() - start_time

    # 3. Submit result

    submitted = _submit_extraction_result(
        api_client=api_client,
        extraction_id=extraction_id,
        result=result,
        lease_token=lease_token,
    )

    logger.info(
        "Packaging extraction %s for UPC %s completed in %.1fs — status=%s, submitted=%s",
        extraction_id, upc, elapsed, result.status, submitted,
        extra={
            "job_id": extraction_id,
            "runner_name": runner_name,
            "phase": "completed",
            "upc": upc,
            "details": {
                "extraction_id": extraction_id,
                "upc": upc,
                "elapsed_seconds": round(elapsed, 2),
                "status": result.status,
                "confidence": result.overall_confidence,
                "image_count": len(data_urls),
            },
        },
    )

    if job_logging and hasattr(job_logging, "emit_progress"):
        job_logging.emit_progress(
            status="completed" if result.status == "succeeded" else "failed",
            progress=100,
            message=f"Packaging extraction {result.status} for UPC {upc}",
            phase="completed",
            details={
                "extraction_id": extraction_id,
                "upc": upc,
                "status": result.status,
                "elapsed_seconds": round(elapsed, 2),
                "confidence": result.overall_confidence,
            },
            items_total=1,
        )

    results["upcs_processed"] = 1 if result.status == "succeeded" else 0
    results["data"][upc] = {
        "status": result.status,
        "confidence": result.overall_confidence,
        "error": result.error_message,
    }
    results["logs"] = log_buffer
    return results


# ---------------------------------------------------------------------------
# Callback Submission
# ---------------------------------------------------------------------------


def _submit_extraction_result(
    api_client: Any | None,
    extraction_id: str,
    result: PackagingExtractionResult,
    lease_token: str | None = None,
) -> bool:
    """Submit packaging extraction result back to the coordinator."""
    if not api_client or not hasattr(api_client, "submit_packaging_extraction_result"):
        logger.warning("No API client or submit_packaging_extraction_result method — callback skipped")
        return False

    if not extraction_id:
        logger.warning("No extraction_id — packaging extraction result not submitted")
        return False

    try:
        result_dict = {
            "upc": result.upc,
            "status": result.status,
            "schema_version": result.schema_version,
            "prompt_version": result.prompt_version,
            "provider": result.provider,
            "model": result.model,
            "raw_text": result.raw_text,
            "structured_facts": result.structured_facts,
            "field_confidence": result.field_confidence,
            "overall_confidence": result.overall_confidence,
            "image_urls": result.image_urls,
            "image_fingerprints": result.image_fingerprints,
            "image_metadata": result.image_metadata,
            "notes": result.notes,
            "error_message": result.error_message,
            "usage": {
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
            },
            "hostname": result.hostname,
        }

        result_json = json.dumps(result_dict)

        submitted = api_client.submit_packaging_extraction_result(
            extraction_id=extraction_id,
            status=result.status,
            result_json=result_json,
            error_message=result.error_message,
            lease_token=lease_token,
        )
        if submitted:
            logger.info(
                "Packaging extraction result submitted for %s (status=%s)",
                extraction_id, result.status,
            )
        else:
            logger.warning(
                "Failed to submit packaging extraction result for %s",
                extraction_id,
            )
        return submitted

    except Exception as e:
        logger.error("Error submitting packaging extraction result: %s", e)
        return False
