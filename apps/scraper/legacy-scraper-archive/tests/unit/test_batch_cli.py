from __future__ import annotations

import json
from pathlib import Path
from typing import cast
from unittest.mock import patch

from click.testing import CliRunner

from cli.commands import batch as batch_commands
from cli.main import cli


class _FakeBrowser:
    async def quit(self) -> None:
        return None


class _FakeWorkflowExecutor:
    def __init__(self, config: object, **_: object) -> None:
        self.config: object = config
        self.browser: _FakeBrowser | None = None

    async def initialize(self) -> None:
        self.browser = _FakeBrowser()

    async def execute_workflow(
        self,
        context: dict[str, object] | None = None,
        quit_browser: bool = True,
    ) -> dict[str, object]:
        del quit_browser
        active_context = context or {}
        sku = str(active_context.get("sku") or "")
        return {
            "success": True,
            "results": {
                "Name": f"Product {sku}",
                "UPC": sku,
                "Brand": "Test Brand",
            },
        }


def _write_config(path: Path) -> None:
    _ = path.write_text(
        "\n".join(
            [
                'schema_version: "1.0"',
                "name: test-scraper",
                "base_url: https://example.com",
                "selectors: []",
                "workflows: []",
                "test_skus:",
                '  - "123456780001"',
                '  - "123456780002"',
                '  - "123456780003"',
                '  - "999999990001"',
            ]
        ),
        encoding="utf-8",
    )


def test_batch_command_runs_and_writes_output(tmp_path: Path) -> None:
    config_path = tmp_path / "test-scraper.yaml"
    output_path = tmp_path / "batch-report.json"
    _write_config(config_path)

    with patch.object(batch_commands, "WorkflowExecutor", _FakeWorkflowExecutor):
        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "batch",
                "test",
                "--product-line",
                "blue-buffalo-dog",
                "--scraper",
                "test-scraper",
                "--upc-prefix",
                "12345678",
                "--limit",
                "2",
                "--config",
                str(config_path),
                "--output",
                str(output_path),
            ],
        )

    assert result.exit_code == 0, result.output
    assert "Batch test setup" in result.output
    assert "12345678" in result.output
    assert "Full report saved to" in result.output

    payload = cast(dict[str, object], json.loads(output_path.read_text(encoding="utf-8")))
    assert payload["summary"] == {
        "batches_processed": 1,
        "products_processed": 2,
        "products_succeeded": 2,
        "products_failed": 0,
        "successful_batches": 1,
        "partial_batches": 0,
        "failed_batches": 0,
    }
    results = cast(dict[str, object], payload["results"])
    assert sorted(results) == ["12345678"]
    batch_result = cast(dict[str, object], results["12345678"])
    batch_products = cast(dict[str, object], batch_result["results"])
    assert sorted(batch_products) == ["123456780001", "123456780002"]


def test_batch_command_errors_when_prefix_matches_no_products(tmp_path: Path) -> None:
    config_path = tmp_path / "test-scraper.yaml"
    _write_config(config_path)

    with patch.object(batch_commands, "WorkflowExecutor", _FakeWorkflowExecutor):
        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "batch",
                "test",
                "--scraper",
                "test-scraper",
                "--upc-prefix",
                "55555555",
                "--config",
                str(config_path),
            ],
        )

    assert result.exit_code != 0
    assert "No test SKUs matched scraper 'test-scraper' with UPC prefix '55555555'." in result.output


def test_batch_validate_command_prints_login_runtime_preflight(tmp_path: Path) -> None:
    config_path = tmp_path / "login-scraper.yaml"
    _ = config_path.write_text(
        "\n".join(
            [
                'schema_version: "1.0"',
                "name: phillips",
                "base_url: https://shop.phillipspet.com",
                "selectors: []",
                "workflows:",
                "  - action: login",
                "    params: {}",
                "login:",
                "  url: https://shop.phillipspet.com/login",
                "  username_field: '#emailField'",
                "  password_field: '#passwordField'",
                "  submit_button: '#send2Dsk'",
            ]
        ),
        encoding="utf-8",
    )

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "batch",
            "validate",
            "--config",
            str(config_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "Validation Result: VALID" in result.output
    assert "Login Runtime:" in result.output
    assert "credential_refs: phillips" in result.output


def test_runner_batch_error_mapping_uses_logs_when_runner_data_is_missing() -> None:
    products = [{"sku": "SKU-1", "product_line": "test", "product_name": "test 1", "scraper": "phillips"}]
    runner_results = {
        "data": {},
        "logs": [
            {
                "message": "phillips/SKU-1: AuthenticationError - Login failed for phillips: Missing login credentials",
                "sku": "SKU-1",
                "scraper_name": "phillips",
                "level": "error",
            }
        ],
    }

    processed = batch_commands._cohort_results_from_runner_payload(
        runner_results=runner_results,
        products=products,
    )

    result = processed["SKU-1"]
    assert result.status == "failed"
    assert result.results["SKU-1"]["error"] == "Login failed for phillips: Missing login credentials"
