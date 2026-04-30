from __future__ import annotations

from benchmarks.official_brand.metrics import DiscoveryResultRow, summarize


def test_summarize_calculates_domain_match_rate() -> None:
    rows = [
        DiscoveryResultRow(
            sku="SKU-1",
            brand="A",
            product_name="One",
            expected_official_domains=["a.com"],
            expected_url=None,
            discovered_url="https://a.com/p/1",
            discovered_domain="a.com",
            domain_match=True,
            exact_url_match=False,
            duration_ms=100,
            cost_usd=0.0,
            error=None,
        ),
        DiscoveryResultRow(
            sku="SKU-2",
            brand="B",
            product_name="Two",
            expected_official_domains=["b.com"],
            expected_url=None,
            discovered_url=None,
            discovered_domain=None,
            domain_match=False,
            exact_url_match=False,
            duration_ms=200,
            cost_usd=0.0,
            error="no_url_found",
        ),
    ]

    summary = summarize(rows)
    assert summary["total_entries"] == 2
    assert summary["domain_match_count"] == 1
    assert summary["domain_match_rate"] == 0.5
    assert summary["failed_count"] == 1
