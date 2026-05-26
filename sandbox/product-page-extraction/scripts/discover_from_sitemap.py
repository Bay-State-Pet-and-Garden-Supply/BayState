#!/usr/bin/env python3
"""Discover candidate product URLs from sitemap/robots config."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from common import candidate_score, get_output_dir, load_dotenv, now_slug, sandbox_path, tokenize, url_allowed, write_json


def fetch_text(url: str, timeout: int = 20) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BayStateLocalResolverSandbox/0.1"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read(2_000_000).decode("utf-8", errors="replace")
    except Exception:
        return None


def parse_sitemap(text: str) -> tuple[list[str], list[str]]:
    try:
        root = ET.fromstring(text.encode("utf-8"))
    except ET.ParseError:
        return [], []
    urls: list[str] = []
    nested: list[str] = []
    for elem in root.iter():
        if elem.tag.endswith("loc") and elem.text:
            loc = elem.text.strip()
            (nested if loc.endswith(".xml") or "sitemap" in loc.lower() else urls).append(loc)
    return urls, nested


def load_site_config(path: Path, site_key: str) -> dict[str, Any]:
    import yaml

    data = yaml.safe_load(path.read_text())
    try:
        return data["sites"][site_key]
    except KeyError as exc:
        raise SystemExit(f"site_key {site_key!r} not found in {path}") from exc


def robots_sitemaps(domain: str) -> list[str]:
    text = fetch_text(f"https://{domain}/robots.txt") or ""
    return [line.split(":", 1)[1].strip() for line in text.splitlines() if line.lower().startswith("sitemap:")]


def discover(site: dict[str, Any], *, brand: str, name: str, upc: str | None, max_urls: int | None = None) -> list[dict[str, Any]]:
    domains = site.get("official_domains") or []
    queue = list(site.get("sitemap_urls") or [])
    if site.get("discover_robots", True):
        for domain in domains:
            queue.extend(robots_sitemaps(domain))
    seen_sitemaps: set[str] = set()
    urls: list[str] = []
    max_urls = max_urls or int(site.get("max_urls", 500))
    max_sitemaps = int(site.get("max_sitemaps", 25))
    include = [re.compile(p) for p in site.get("include_url_patterns", [])]
    exclude = [re.compile(p) for p in site.get("exclude_url_patterns", [])]

    while queue and len(seen_sitemaps) < max_sitemaps and len(urls) < max_urls:
        sitemap = queue.pop(0)
        if sitemap in seen_sitemaps or not url_allowed(sitemap, domains):
            continue
        seen_sitemaps.add(sitemap)
        text = fetch_text(sitemap)
        if not text:
            continue
        found, nested = parse_sitemap(text)
        queue.extend([s for s in nested if url_allowed(s, domains)])
        for url in found:
            if not url_allowed(url, domains):
                continue
            if include and not any(p.search(url) for p in include):
                continue
            if any(p.search(url) for p in exclude):
                continue
            if url not in urls:
                urls.append(url)
            if len(urls) >= max_urls:
                break

    terms = sorted(set(tokenize(f"{brand} {name}")))
    scored = []
    for url in urls:
        score = candidate_score(url, title=url, h1="", text=url, query_terms=terms, upc=upc)
        scored.append({"url": url, **score})
    return sorted(scored, key=lambda item: item["score"], reverse=True)


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Discover candidate URLs from a sitemap config.")
    parser.add_argument("--site-config", type=Path, required=True)
    parser.add_argument("--site-key", default="fromm-example")
    parser.add_argument("--upc")
    parser.add_argument("--brand", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--output-dir", default=str(get_output_dir()))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    site = load_site_config(sandbox_path(args.site_config), args.site_key)
    out_dir = sandbox_path(args.output_dir) / f"{now_slug()}-discovery"
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.dry_run:
        result = {"dry_run": True, "site_key": args.site_key, "site": site}
    else:
        result = {"dry_run": False, "site_key": args.site_key, "candidates": discover(site, brand=args.brand, name=args.name, upc=args.upc)[: args.limit]}
    write_json(out_dir / "candidates.json", result)
    print(json.dumps({"output_dir": str(out_dir), "candidates": str(out_dir / "candidates.json")}, indent=2))


if __name__ == "__main__":
    main()
