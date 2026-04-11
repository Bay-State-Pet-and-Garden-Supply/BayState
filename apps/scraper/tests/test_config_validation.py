from __future__ import annotations

import pytest

from scrapers.config_validation import ValidationReport, print_validation_report, validate_config


def _set_required_base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-" + ("x" * 48))
    monkeypatch.setenv("SCRAPER_API_URL", "https://baystate.example.com")
    monkeypatch.setenv("SCRAPER_API_KEY", "bsr_" + ("y" * 24))


def test_validate_config_accepts_serper_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "serper")
    monkeypatch.setenv("SERPER_API_KEY", "serper-config-key-1234567890")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is True
    assert report.errors == []


def test_validate_config_warns_when_brave_key_is_present_but_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "auto")
    monkeypatch.setenv("BRAVE_API_KEY", "brave-key-12345678901234567890")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("SERPER_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is True
    assert "BRAVE_API_KEY is deprecated and ignored" in report.warnings


def test_validate_config_requires_serper_key_when_provider_is_serper(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "serper")
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is False
    assert "SERPER_API_KEY is not set" in report.errors


def test_validate_config_allows_auto_mode_without_search_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required_base_env(monkeypatch)
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "auto")
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    report = validate_config()

    assert report.is_valid is True
    assert report.errors == []


def test_validate_config_reports_invalid_provider_and_invalid_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "not-an-openai-key")
    monkeypatch.setenv("AI_SEARCH_PROVIDER", "duckduckgo")
    monkeypatch.setenv("SERPER_API_KEY", "short")
    monkeypatch.setenv("SCRAPER_API_URL", "not-a-url")
    monkeypatch.setenv("SCRAPER_API_KEY", "short")

    report = validate_config()

    assert report.is_valid is False
    assert "OPENAI_API_KEY must start with 'sk-'" in report.errors
    assert "AI_SEARCH_PROVIDER must be one of: auto, serper, gemini" in report.errors
    assert "SCRAPER_API_URL is not a valid URL format" in report.errors
    assert "SCRAPER_API_KEY may be truncated or invalid" in report.warnings
    assert "SERPER_API_KEY may be truncated or invalid" in report.warnings


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
