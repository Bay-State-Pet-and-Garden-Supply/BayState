from __future__ import annotations

import pytest

from scrapers.config_validation import ValidationReport, print_validation_report, validate_config


def _set_required_base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-" + ("x" * 48))
    monkeypatch.setenv("SCRAPER_API_URL", "https://baystate.example.com")
    monkeypatch.setenv("SCRAPER_API_KEY", "bsr_" + ("y" * 24))


def test_validate_config_accepts_serpapi_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "serpapi")
    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-config-key-1234567890")
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is True
    assert report.errors == []


def test_validate_config_allows_auto_mode_with_brave_fallback_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "auto")
    monkeypatch.setenv("BRAVE_API_KEY", "brave-key-12345678901234567890")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is True
    assert any("fall back to Brave" in warning for warning in report.warnings)


def test_validate_config_requires_serpapi_key_when_provider_is_serpapi(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "serpapi")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is False
    assert "SERPAPI_API_KEY is not set" in report.errors


def test_validate_config_requires_search_key_in_auto_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "auto")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is False
    assert "Either SERPAPI_API_KEY or BRAVE_API_KEY must be set" in report.errors


def test_validate_config_reports_invalid_provider_and_invalid_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "not-an-openai-key")
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "duckduckgo")
    monkeypatch.setenv("SERPAPI_API_KEY", "short")
    monkeypatch.setenv("SCRAPER_API_URL", "not-a-url")
    monkeypatch.setenv("SCRAPER_API_KEY", "short")

    report = validate_config()

    assert report.is_valid is False
    assert "OPENAI_API_KEY must start with 'sk-'" in report.errors
    assert "AI_SEARCH_PROVIDER must be one of: auto, serpapi, brave" in report.errors
    assert "SCRAPER_API_URL is not a valid URL format" in report.errors
    assert "SCRAPER_API_KEY may be truncated or invalid" in report.warnings
    assert "SERPAPI_API_KEY may be truncated or invalid" in report.warnings


def test_validation_report_to_dict_and_print(capsys: pytest.CaptureFixture[str]) -> None:
    report = ValidationReport(
        is_valid=False,
        errors=["Missing credentials"],
        warnings=["Runner name missing"],
    )

    assert report.to_dict() == {
        "is_valid": False,
        "errors": ["Missing credentials"],
        "warnings": ["Runner name missing"],
    }

    print_validation_report(report)
    output = capsys.readouterr().out

    assert "SCRAPER CONFIGURATION VALIDATION REPORT" in output
    assert "Missing credentials" in output
    assert "Runner name missing" in output


def test_print_validation_report_runs_validation_when_report_missing(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        "scrapers.config_validation.validate_config",
        lambda: ValidationReport(is_valid=True, errors=[], warnings=[]),
    )

    print_validation_report()
    output = capsys.readouterr().out

    assert "Configuration is VALID" in output
    assert "(No issues found)" in output
