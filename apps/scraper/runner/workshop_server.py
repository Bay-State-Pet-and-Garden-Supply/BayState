"""Workshop extraction — async HTTP server for sync selector testing (stdlib only)."""

from __future__ import annotations

import asyncio, json, logging, time as _time
from typing import Any

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
from scrapers.product_url_extraction.image_candidates import build_image_candidates, select_image_candidates

logger = logging.getLogger("workshop_server")
TIMEOUT = 15.0
_sem = asyncio.Semaphore(3)

async def handle_workshop_extract(body: dict[str, Any]) -> dict[str, Any]:
    url = body.get("url", "")
    selectors = body.get("selectors", [])
    browser_ref = body.get("browser_profile_ref")
    if not url: return {"error": "url required", "error_code": "missing_url"}
    if not isinstance(selectors, list) or not selectors: return {"error": "selectors[] required", "error_code": "missing_selectors"}

    fields = []
    for s in selectors:
        if not isinstance(s, dict): continue
        f: dict[str, Any] = {"name": s.get("name", s.get("field_name", "unknown")), "selector": s.get("selector", ""), "type": s.get("type", "text")}
        if s.get("attribute"): f["attribute"] = s["attribute"]
        fields.append(f)
    if not fields: return {"error": "No valid selectors", "error_code": "empty_selectors"}

    schema = {"name": "Workshop extraction", "baseSelector": "body", "fields": fields}
    logger.info("Workshop schema fields: %s", [(f['name'], f['selector'], f.get('type','')) for f in fields])

    # Helper to check if any selector uses XPath
    def should_use_xpath(schema: dict[str, Any]) -> bool:
        def is_xpath(selector: str) -> bool:
            if not selector: return False
            s = selector.strip()
            return s.startswith("/") or s.startswith("./") or s.startswith("(") or s.startswith("xpath:")
        
        if is_xpath(schema.get("baseSelector", "")):
            return True
        for field in schema.get("fields", []):
            if is_xpath(field.get("selector", "")) or is_xpath(field.get("xpath", "")):
                return True
            for nested in field.get("fields", []):
                if is_xpath(nested.get("selector", "")) or is_xpath(nested.get("xpath", "")):
                    return True
        return False

    if should_use_xpath(schema):
        from crawl4ai.extraction_strategy import JsonXPathExtractionStrategy
        logger.info("Using JsonXPathExtractionStrategy for workshop extraction")
        strategy = JsonXPathExtractionStrategy(schema=schema)
    else:
        logger.info("Using JsonCssExtractionStrategy for workshop extraction")
        strategy = JsonCssExtractionStrategy(schema=schema)

    # Resolve browser profile path if provided
    user_data_dir: str | None = None
    if browser_ref:
        from runner.profile_maintenance import _resolve_profile_path
        user_data_dir = _resolve_profile_path(browser_ref)

    cfg = CrawlerRunConfig(
        extraction_strategy=strategy,
        wait_for_images=True,
        scan_full_page=True,
        page_timeout=int(TIMEOUT * 1000),
        cache_mode=CacheMode.DISABLED,
        excluded_tags=[],
    )
    start = _time.monotonic()

    try:
        # Use AsyncWebCrawler with defaults (matching _crawl_target pattern).
        # Only pass user_data_dir if a browser profile was resolved.
        crawler_kwargs: dict[str, Any] = {}
        if user_data_dir:
            crawler_kwargs["user_data_dir"] = user_data_dir
        async with AsyncWebCrawler(**crawler_kwargs) as crawler:
            result = await asyncio.wait_for(crawler.arun(url, config=cfg), timeout=TIMEOUT)
    except asyncio.TimeoutError:
        return {"error": f"Timed out after {TIMEOUT}s", "error_code": "timeout", "elapsed_ms": int((_time.monotonic() - start) * 1000), "results": [], "images": []}
    except Exception as e:
        return {"error": str(e), "error_code": "extraction_failed", "elapsed_ms": int((_time.monotonic() - start) * 1000), "results": [], "images": []}

    elapsed = int((_time.monotonic() - start) * 1000)
    extracted = getattr(result, "extracted_content", None)
    raw_html = getattr(result, "html", "") or ""
    cleaned = getattr(result, "cleaned_html", "") or ""
    logger.info("Workshop extraction: success=%s, extracted_content type=%s, len=%s, html_len=%s, cleaned_len=%s",
                getattr(result, 'success', None), type(extracted).__name__,
                len(extracted) if extracted else 0, len(raw_html), len(cleaned))
    if extracted:
        logger.info("Workshop extraction raw (first 300): %s", str(extracted)[:300])
    results: list[dict[str, Any]] = []

    if extracted:
        try:
            parsed = json.loads(extracted) if isinstance(extracted, str) else extracted
            items = [parsed] if isinstance(parsed, dict) else parsed if isinstance(parsed, list) else []
            for item in items:
                if isinstance(item, dict):
                    for k, v in item.items():
                        results.append({"field": k, "selector": _find_sel(fields, k), "extracted_value": v, "confidence": 1.0, "error": None})
        except (json.JSONDecodeError, TypeError):
            results.append({"field": "content", "selector": "body", "extracted_value": str(extracted)[:500], "confidence": 0.5, "error": "Non-JSON content"})
    else:
        for f in fields:
            results.append({"field": f["name"], "selector": f["selector"], "extracted_value": None, "confidence": 0.0, "error": "No content extracted"})

    images: list[dict[str, Any]] = []
    try:
        html = getattr(result, "html", None) or getattr(result, "cleaned_html", None) or ""
        cd = {"url": getattr(result, "url", url) or url, "success": bool(getattr(result, "success", False)), "html": html, "media": getattr(result, "media", None) or {"images": []}}
        candidates = build_image_candidates(crawl_result=cd, source_url=url, page_html=html)
        selection = select_image_candidates(candidates=candidates, source_url=url, product_name=None, brand=None)
        if selection.primary: images.append(selection.primary.to_dict())
        for g in selection.gallery[:10]: images.append(g.to_dict())
        for r in selection.rejected[:10]:
            img_dict = r.to_dict()
            img_dict["rejected"] = True
            img_dict["rejection_reason"] = ", ".join(r.rejection_reasons) if r.rejection_reasons else "Rejected"
            images.append(img_dict)
    except Exception as e:
        logger.warning("Image detection failed: %s", e)

    return {"results": results, "images": images, "elapsed_ms": elapsed, "url": getattr(result, "url", url) or url, "success": True}

def _find_sel(fields: list[dict[str, Any]], name: str) -> str:
    for f in fields:
        if f.get("name") == name: return f.get("selector", "")
    return ""

async def workshop_extract_endpoint(body: dict[str, Any]) -> dict[str, Any]:
    async with _sem: return await handle_workshop_extract(body)

# -- asyncio HTTP server --
_server: asyncio.AbstractServer | None = None

async def _handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        data = await asyncio.wait_for(reader.read(65536), timeout=5.0)
        text = data.decode("utf-8", errors="replace")
        lines = text.split("\r\n")
        if not lines: return await _err(writer, 400)
        parts = lines[0].split(" ")
        if len(parts) < 2 or parts[0] != "POST" or parts[1] != "/api/scraper/v1/workshop/extract":
            return await _err(writer, 404)
        headers: dict[str, str] = {}
        cl = 0
        for line in lines[1:]:
            if not line.strip(): break
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        cl = int(headers.get("content-length", "0"))
        body_b = text.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in text else ""
        if len(body_b.encode()) < cl:
            body_b += (await asyncio.wait_for(reader.read(cl - len(body_b.encode())), timeout=5.0)).decode("utf-8", errors="replace")
        api_key = headers.get("x-api-key", "")
        if not api_key or not api_key.startswith("bsr_"): return await _err(writer, 401)
        body = json.loads(body_b)
        result = await workshop_extract_endpoint(body)
        resp = json.dumps(result).encode()
        writer.write(f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(resp)}\r\nConnection: close\r\n\r\n".encode() + resp)
        await writer.drain()
    except asyncio.TimeoutError:
        await _err(writer, 408)
    except Exception as e:
        logger.error("Workshop handler error: %s", e)
        try: await _err(writer, 500)
        except: pass
    finally:
        try: writer.close(); await writer.wait_closed()
        except: pass

async def _err(writer: asyncio.StreamWriter, status: int) -> None:
    msg = {400: "Bad Request", 401: "Unauthorized", 404: "Not Found", 408: "Timeout", 500: "Error"}.get(status, "Error")
    body = json.dumps({"error": msg, "error_code": f"http_{status}"}).encode()
    try: writer.write(f"HTTP/1.1 {status} {msg}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body); await writer.drain()
    except: pass

async def start_workshop_server(port: int = 9099) -> asyncio.AbstractServer:
    global _server
    _server = await asyncio.start_server(_handler, host="0.0.0.0", port=port)
    logger.info("Workshop server on port %d", port)
    return _server

async def stop_workshop_server(_server_arg: object = None) -> None:
    global _server
    if _server: _server.close(); await _server.wait_closed(); _server = None
