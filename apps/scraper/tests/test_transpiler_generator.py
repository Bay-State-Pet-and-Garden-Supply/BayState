from __future__ import annotations

from pathlib import Path

import yaml

from lib.transpiler import YAMLToCrawl4AITranspiler
from transpiler.__main__ import main as transpiler_main


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def test_transpile_static_mixed_selectors_to_hybrid() -> None:
    transpiler = YAMLToCrawl4AITranspiler()
    config_path = _repo_root() / "scrapers" / "archive" / "legacy-yaml-configs" / "amazon.yaml"

    result = transpiler.transpile_file(config_path)

    assert result.success is True
    assert result.extraction_strategy == "hybrid"
    assert result.schema is not None
    assert "css" in result.schema
    assert "xpath" in result.schema
    assert result.needs_manual_review is False


def test_transpile_agentic_generates_llm_payload() -> None:
    transpiler = YAMLToCrawl4AITranspiler()
    config_path = _repo_root() / "scrapers" / "configs" / "ai-amazon.yaml"

    result = transpiler.transpile_file(config_path)

    assert result.success is True
    assert result.extraction_strategy == "llm"
    assert result.schema is not None
    provider = result.schema.get("provider")
    assert isinstance(provider, str)
    assert provider.startswith("openai/")
    assert "schema" in result.schema
    assert "properties" in result.schema["schema"]


def test_transpile_flags_manual_review_for_unsupported_action() -> None:
    transpiler = YAMLToCrawl4AITranspiler()
    config_path = _repo_root() / "scrapers" / "archive" / "legacy-yaml-configs" / "bradley.yaml"

    result = transpiler.transpile_file(config_path)

    assert result.success is True
    assert result.needs_manual_review is True
    assert any(issue.code == "unsupported_action" for issue in result.issues)


def test_transpiler_auto_coverage_above_80_percent() -> None:
    transpiler = YAMLToCrawl4AITranspiler()
    root = _repo_root()

    yaml_files = sorted((root / "scrapers" / "configs").glob("*.yaml"))
    yaml_files += sorted((root / "scrapers" / "archive" / "legacy-yaml-configs").glob("*.yaml"))
    yaml_files += sorted((root / "scrapers" / "config").glob("*.yaml"))

    assert yaml_files

    auto_ok = 0
    for file_path in yaml_files:
        result = transpiler.transpile_file(file_path)
        if result.success and not result.needs_manual_review:
            auto_ok += 1

    coverage = auto_ok / len(yaml_files)
    assert coverage >= 0.8


def test_cli_migrate_writes_python_output(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    output_path = tmp_path / "output.py"

    _ = config_path.write_text(
        yaml.safe_dump(
            {
                "name": "example",
                "base_url": "https://example.com",
                "selectors": {
                    "product_name": "h1.title",
                    "price": ".price",
                },
                "workflows": [
                    {"action": "navigate", "params": {"url": "https://example.com/search?q={sku}"}},
                    {"action": "extract", "params": {"fields": ["product_name", "price"]}},
                ],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    exit_code = transpiler_main(["migrate", str(config_path), "--output", str(output_path), "--format", "python"])

    assert exit_code == 0
    content = output_path.read_text(encoding="utf-8")
    assert "MIGRATED_CONFIG" in content
    assert '"scraper_name": "example"' in content
