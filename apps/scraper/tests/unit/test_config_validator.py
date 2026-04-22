from __future__ import annotations

from pathlib import Path

from utils.debugging.config_validator import ConfigValidator, validate_local_runtime_requirements


def test_validate_dict_rejects_non_mapping_top_level() -> None:
    validator = ConfigValidator()

    result = validator.validate_dict(["not", "a", "mapping"])

    assert result.valid is False
    assert result.errors == ["Top-level YAML document must be an object, got list"]


def test_local_runtime_requirements_include_slug_fallback_for_login_config(tmp_path: Path) -> None:
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

    validator = ConfigValidator(strict=False)
    validation_result = validator.validate_file(config_path)
    preflight = validate_local_runtime_requirements(
        config_path,
        validation_result=validation_result,
    )

    assert validation_result.metadata["runtime_credential_refs"] == ["phillips"]
    assert preflight.uses_login is True
    assert preflight.credential_refs == ["phillips"]
    assert preflight.valid is True
    assert any("credential fallback" in warning for warning in validation_result.actionable_warnings)
    assert any("Local login test cannot confirm credentials" in warning for warning in preflight.actionable_warnings)
