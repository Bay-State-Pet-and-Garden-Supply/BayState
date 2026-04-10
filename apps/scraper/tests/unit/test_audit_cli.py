from __future__ import annotations

import json
from pathlib import Path
from typing import cast
from unittest.mock import patch

from click.testing import CliRunner

from cli.commands import audit as audit_commands
from cli.main import cli
from scrapers.models.config import ScraperConfig


class _FakeBrowser:
    async def quit(self) -> None:
        return None


class _FakeWorkflowExecutor:
    responses: dict[str, dict[str, dict[str, object] | Exception]] = {}

    def __init__(self, config: object, **_: object) -> None:
        self.config = config
        self.browser = _FakeBrowser()

    async def execute_workflow(
        self,
        context: dict[str, object] | None = None,
        quit_browser: bool = True,
        **_: object,
    ) -> dict[str, object]:
        del quit_browser
        active_context = context or {}
        sku = str(active_context.get("sku") or "")
        scraper_name = str(getattr(self.config, "name", "unknown"))
        response = self.responses[scraper_name][sku]
        if isinstance(response, Exception):
            raise response
        return cast(dict[str, object], response)


def _write_config(
    path: Path,
    *,
    name: str,
    test_skus: list[str],
    fake_skus: list[str],
    edge_case_skus: list[str],
) -> None:
    _ = path.write_text(
        "\n".join(
            [
                'schema_version: "1.0"',
                f"name: {name}",
                "base_url: https://example.com",
                "selectors:",
                "  - name: Name",
                "    selector: h1",
                "    attribute: text",
                "    multiple: false",
                "    required: true",
                "  - name: Price",
                "    selector: .price",
                "    attribute: text",
                "    multiple: false",
                "    required: true",
                "  - name: Images",
                "    selector: img",
                "    attribute: src",
                "    multiple: true",
                "    required: true",
                "  - name: Weight",
                "    selector: .weight",
                "    attribute: text",
                "    multiple: false",
                "    required: false",
                "workflows: []",
                "test_skus:",
                *[f'  - "{sku}"' for sku in test_skus],
                "fake_skus:",
                *[f'  - "{sku}"' for sku in fake_skus],
                "edge_case_skus:",
                *[f'  - "{sku}"' for sku in edge_case_skus],
            ]
        ),
        encoding="utf-8",
    )


def test_audit_run_all_discovers_configs_and_writes_reports(tmp_path: Path) -> None:
    alpha_config = tmp_path / "alpha.yaml"
    beta_config = tmp_path / "beta.yaml"
    markdown_path = tmp_path / "fleet-health-matrix.md"
    json_path = tmp_path / "fleet-health-matrix.json"

    _write_config(alpha_config, name="alpha", test_skus=["ALPHA-POS"], fake_skus=["ALPHA-NEG"], edge_case_skus=["ALPHA-EDGE"])
    _write_config(beta_config, name="beta", test_skus=["BETA-POS"], fake_skus=["BETA-NEG"], edge_case_skus=["BETA-EDGE"])

    _FakeWorkflowExecutor.responses = {
        "alpha": {
            "ALPHA-POS": {
                "success": True,
                "results": {
                    "SKU": "ALPHA-POS",
                    "Name": "Alpha Product",
                    "Price": "$10.99",
                    "Images": ["https://example.com/alpha.jpg"],
                },
            },
            "ALPHA-NEG": {
                "success": True,
                "results": {
                    "SKU": "ALPHA-NEG",
                    "no_results_found": True,
                },
            },
            "ALPHA-EDGE": {
                "success": True,
                "results": {
                    "SKU": "ALPHA-EDGE",
                    "no_results_found": True,
                },
            },
        },
        "beta": {
            "BETA-POS": {
                "success": True,
                "results": {
                    "SKU": "BETA-POS",
                    "Name": "Beta Product",
                    "Price": "$20.99",
                    "Images": ["https://example.com/beta.jpg"],
                    "Weight": "2 lb",
                },
            },
            "BETA-NEG": {
                "success": True,
                "results": {
                    "SKU": "BETA-NEG",
                    "no_results_found": True,
                },
            },
            "BETA-EDGE": {
                "success": True,
                "results": {
                    "SKU": "BETA-EDGE",
                    "Name": "Beta Edge Product",
                    "Price": "$21.99",
                    "Images": ["https://example.com/beta-edge.jpg"],
                    "Weight": "3 lb",
                },
            },
        },
    }

    with patch.object(audit_commands, "discover_config_paths", return_value=[alpha_config, beta_config]):
        with patch.object(audit_commands, "WorkflowExecutor", _FakeWorkflowExecutor):
            runner = CliRunner()
            result = runner.invoke(
                cli,
                [
                    "audit",
                    "run",
                    "--all",
                    "--output",
                    str(markdown_path),
                    "--json-output",
                    str(json_path),
                ],
            )

    assert result.exit_code == 0, result.output
    assert "Fleet audit complete" in result.output

    markdown = markdown_path.read_text(encoding="utf-8")
    payload = cast(dict[str, object], json.loads(json_path.read_text(encoding="utf-8")))
    summary = cast(dict[str, object], payload["summary"])

    assert "| alpha | Degraded |" in markdown
    assert "| beta | Healthy |" in markdown
    assert "Optional fields always missing: Weight" in markdown
    assert summary == {
        "scrapers_audited": 2,
        "healthy": 1,
        "degraded": 1,
        "critical": 0,
        "average_score": 97.5,
    }


def test_audit_run_marks_critical_failures_and_classifies_findings(tmp_path: Path) -> None:
    gamma_config = tmp_path / "gamma.yaml"
    markdown_path = tmp_path / "fleet-health-matrix.md"
    json_path = tmp_path / "fleet-health-matrix.json"

    _write_config(
        gamma_config,
        name="gamma",
        test_skus=["BLOCKED-SKU", "SITE-CHANGE-SKU"],
        fake_skus=["GAMMA-NEG"],
        edge_case_skus=["GAMMA-EDGE"],
    )

    _FakeWorkflowExecutor.responses = {
        "gamma": {
            "BLOCKED-SKU": Exception("Access denied blocked by cloudflare"),
            "SITE-CHANGE-SKU": {
                "success": True,
                "results": {
                    "SKU": "SITE-CHANGE-SKU",
                    "Name": "Partial Product",
                },
            },
            "GAMMA-NEG": {
                "success": True,
                "results": {
                    "SKU": "GAMMA-NEG",
                    "no_results_found": True,
                },
            },
            "GAMMA-EDGE": {
                "success": True,
                "results": {
                    "SKU": "GAMMA-EDGE",
                    "no_results_found": True,
                },
            },
        },
    }

    with patch.object(audit_commands, "WorkflowExecutor", _FakeWorkflowExecutor):
        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "audit",
                "run",
                "--config",
                str(gamma_config),
                "--output",
                str(markdown_path),
                "--json-output",
                str(json_path),
            ],
        )

    assert result.exit_code == 0, result.output

    markdown = markdown_path.read_text(encoding="utf-8")
    payload = cast(dict[str, object], json.loads(json_path.read_text(encoding="utf-8")))
    summary = cast(dict[str, object], payload["summary"])

    assert "## gamma — Critical" in markdown
    assert "Anti-Bot Block" in markdown
    assert "Site Change" in markdown
    assert "BLOCKED-SKU" in markdown
    assert "SITE-CHANGE-SKU" in markdown
    assert summary["critical"] == 1


def test_collect_field_specs_ignores_helper_selectors_and_internal_urls() -> None:
    config = ScraperConfig.model_validate(
        {
            "schema_version": "1.0",
            "name": "coastal-like",
            "base_url": "https://example.com",
            "selectors": [
                {
                    "name": "search_result_link",
                    "selector": "a.result-link",
                    "attribute": "href",
                    "required": True,
                },
                {
                    "name": "Name",
                    "selector": "h1",
                    "attribute": "text",
                    "required": True,
                },
            ],
            "workflows": [
                {
                    "action": "extract_single",
                    "params": {
                        "field": "product_url",
                        "selector_id": "search_result_link",
                    },
                },
                {
                    "action": "extract",
                    "params": {
                        "fields": ["Name"],
                    },
                },
            ],
        }
    )

    field_specs = audit_commands._collect_field_specs(config)

    assert any(spec.display_name == "Name" for spec in field_specs.values())
    assert "search_result_link" not in field_specs
    assert "product_url" not in field_specs
