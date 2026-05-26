#!/usr/bin/env bash
set -euo pipefail

URL="${1:?Usage: agent_browser_capture.sh <url> <run-id-or-upc> [output-root]}"
RUN_HINT="${2:-manual}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_ROOT="${3:-$SANDBOX_ROOT/agent-browser-runs}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${RUN_HINT//[^A-Za-z0-9_.-]/-}"
OUT_DIR="$OUT_ROOT/$RUN_ID"
PROFILE="$OUT_DIR/profile"
mkdir -p "$OUT_DIR" "$PROFILE"

BIN="${AGENT_BROWSER_BIN:-agent-browser}"
command -v "$BIN" >/dev/null || { echo "agent-browser not found" >&2; exit 1; }

# Shared rendered evidence JS with product cards — matches RENDERED_EVIDENCE_JS in common.py
JS='(() => {
  const absolutize = (value) => {
    try { return value ? new URL(value, location.href).href : null; } catch (e) { return value; }
  };
  const splitSrcset = (value) => String(value || "").split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  const collectImages = (root) => {
    const urls = new Set();
    const attrs = ["src", "srcset", "data-src", "data-srcset", "data-large", "data-original", "data-zoom", "data-hires"];
    const els = (root || document).querySelectorAll("img, source, [style*=background]");
    for (const el of els) {
      for (const attr of attrs) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        if (attr.includes("srcset")) splitSrcset(value).forEach((u) => urls.add(absolutize(u)));
        else urls.add(absolutize(value));
      }
      const style = el.getAttribute("style") || "";
      const matches = style.matchAll(/url\(["'"'"']?([^"'"'"'\)]+)["'"'"']?\)/g);
      for (const match of matches) urls.add(absolutize(match[1]));
    }
    return Array.from(urls).filter(Boolean);
  };
  const collectProductCards = (root) => {
    const cards = [];
    const selectors = ["article[class*=product]", "[class*=product-card]", ".product-item", "li.product", "div[class*=product]", "[class*=ProductCard]", "[class*=product-tile]", "[data-product-id]", "[data-product-sku]", "[class*=grid-item]"];
    const seenSigs = new Set();
    for (const sel of selectors) {
      const elements = (root || document).querySelectorAll(sel);
      for (const el of elements) {
        const link = el.querySelector("a[href]") || el.closest("a[href]");
        const href = link ? (link.getAttribute("href") || "") : "";
        const titleEl = el.querySelector("h2, h3, h4, .title, .name, [class*=title], [class*=name]");
        const title = titleEl ? titleEl.innerText.trim() : "";
        const dataAttrs = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith("data-")) dataAttrs[attr.name] = attr.value;
        }
        const onclick = link ? (link.getAttribute("onclick") || el.getAttribute("onclick") || "") : "";
        const images = collectImages(el);
        const signature = href.split("?")[0].split("/").filter(Boolean).slice(-3).join("/") + "|" + title.slice(0, 40);
        if ((title || href || images.length > 0) && !seenSigs.has(signature)) {
          seenSigs.add(signature);
          cards.push({ title, href, image_urls: images, onclick, data_attributes: dataAttrs, element_signature: signature });
        }
      }
    }
    return cards.slice(0, 50);
  };
  const allImages = collectImages(null);
  const productCards = collectProductCards(null);
  return JSON.stringify({
    schema_version: "agent_browser_result.v1",
    url: location.href,
    title: document.title,
    h1: Array.from(document.querySelectorAll("h1")).map((e) => e.innerText.trim()).filter(Boolean),
    images: allImages,
    textSample: document.body.innerText.replace(/\s+/g, " ").slice(0, 8000),
    productCards: productCards,
    imageCount: allImages.length,
    productCardCount: productCards.length,
  }, null, 2);
})()'

set +e
"$BIN" --profile "$PROFILE" open "$URL" >"$OUT_DIR/open.log" 2>&1
OPEN_CODE=$?
"$BIN" --profile "$PROFILE" wait 1500 >"$OUT_DIR/wait.log" 2>&1
"$BIN" --profile "$PROFILE" snapshot >"$OUT_DIR/snapshot.txt" 2>"$OUT_DIR/snapshot.err"
"$BIN" --profile "$PROFILE" screenshot "$OUT_DIR/screenshot.png" >"$OUT_DIR/screenshot.log" 2>&1
"$BIN" --profile "$PROFILE" eval "$JS" >"$OUT_DIR/dom-extract.raw.json" 2>"$OUT_DIR/dom-extract.err"
"$BIN" --profile "$PROFILE" close >"$OUT_DIR/close.log" 2>&1
set -e

python3 - "$OUT_DIR" "$RUN_ID" "$URL" "$OPEN_CODE" <<'PY'
import json, sys
from pathlib import Path
out = Path(sys.argv[1]); run_id = sys.argv[2]; url = sys.argv[3]; open_code = int(sys.argv[4])
raw = (out / "dom-extract.raw.json").read_text(errors="replace")
try:
    parsed = json.loads(raw)
    if isinstance(parsed, str):
        parsed = json.loads(parsed)
except Exception:
    parsed = {"_parse_error": True, "raw": raw[:4000]}
cards = parsed.get("productCards", [])
if isinstance(cards, list):
    for card in cards:
        card["data_attributes"] = card.get("data_attributes", {})
        card["onclick"] = card.get("onclick", "")
        card["element_signature"] = card.get("element_signature", "")
images = parsed.get("images", [])
if isinstance(images, list):
    images = list(dict.fromkeys(images))
result = {
    "schema_version": "agent_browser_result.v1",
    "run_id": run_id,
    "url": parsed.get("url") or url,
    "success": open_code == 0 and not parsed.get("_parse_error"),
    "rendered": {
        "title": parsed.get("title"),
        "h1": parsed.get("h1") or [],
        "images": images,
        "textSample": parsed.get("textSample") or "",
        "productCards": cards,
        "imageCount": len(images),
        "productCardCount": len(cards),
        "extractionMethod": "agent-browser-eval",
    },
    "artifacts": {
        "snapshot": str(out / "snapshot.txt"),
        "screenshot": str(out / "screenshot.png"),
        "raw_dom_extract": str(out / "dom-extract.raw.json"),
    },
    "errors": [] if open_code == 0 else ["agent-browser open failed"],
}
(out / "dom-extract.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"output_dir": str(out), "result": str(out / "dom-extract.json")}, indent=2))
PY
