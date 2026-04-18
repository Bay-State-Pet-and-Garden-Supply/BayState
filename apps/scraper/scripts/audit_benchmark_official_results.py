#!/usr/bin/env python3
"""Audit benchmark entries for official-domain results present in raw Serper caches."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

import sys

if str(PROJECT_ROOT) not in sys.path:
    _ = sys.path.insert(0, str(PROJECT_ROOT))

from scrapers.ai_search.scoring import SearchScorer


def _cache_path(cache_dir: Path, query: str) -> Path:
    normalized = " ".join(str(query or "").split()).lower()
    cache_hash = hashlib.sha256(normalized.encode()).hexdigest()
    return cache_dir / f"{cache_hash}.json"


def main() -> int:
    draft_path = PROJECT_ROOT / "data" / "benchmark_expansion" / "golden_dataset_v3_draft.json"
    cache_dir = PROJECT_ROOT / "data" / "benchmark_expansion" / "cache"
    scorer = SearchScorer()

    draft = json.loads(draft_path.read_text(encoding="utf-8"))

    for entry in draft["entries"]:
        expected_domain = scorer.domain_from_url(str(entry.get("expected_source_url") or ""))
        expected_tier = scorer.classify_source_domain(expected_domain, entry.get("brand"))
        if expected_tier == "official":
            continue

        official_hits: list[tuple[str, str, str]] = []
        for query_type, query in (("sku", entry.get("sku_query")), ("name", entry.get("query"))):
            if not query:
                continue
            path = _cache_path(cache_dir, str(query))
            if not path.exists():
                continue
            payload = json.loads(path.read_text(encoding="utf-8"))
            for result in payload.get("results", []):
                url = str(result.get("url") or "")
                domain = scorer.domain_from_url(url)
                if scorer.classify_source_domain(domain, entry.get("brand")) == "official":
                    official_hits.append((query_type, url, str(result.get("title") or "")))

        if official_hits:
            print(f"SKU {entry['sku']} | {entry['brand']} | {entry['query']}")
            print(f"  Expected: {entry['expected_source_url']}")
            for query_type, url, title in official_hits:
                print(f"  [{query_type}] {url}")
                print(f"        {title}")
            print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
