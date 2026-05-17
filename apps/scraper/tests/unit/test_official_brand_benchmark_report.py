from __future__ import annotations

from pathlib import Path

from benchmarks.official_brand.metrics import DiscoveryResultRow
from benchmarks.official_brand.report import build_report, write_report


def test_write_report_writes_json_and_markdown(tmp_path: Path) -> None:
    rows = [
        DiscoveryResultRow(
            sku="SKU-1",
            brand="Brand",
            product_name="Product",
            expected_official_domains=["example.com"],
            expected_url=None,
            discovered_url="https://example.com/p",
            discovered_domain="example.com",
            domain_match=True,
            exact_url_match=False,
            duration_ms=50,
            cost_usd=0.0,
            error=None,
        )
    ]
    report = build_report(
        dataset_path=Path("dataset.json"),
        summary={
            "total_entries": 1,
            "successful_discoveries": 1,
            "domain_match_rate": 1.0,
            "exact_url_match_rate": 0.0,
            "failed_count": 0
        },
        rows=rows
    )
    json_path, md_path = write_report(report=report, output_dir=tmp_path)

    assert json_path.exists()
    assert md_path.exists()
