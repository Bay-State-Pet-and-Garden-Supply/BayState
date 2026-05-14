from __future__ import annotations

import argparse
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import daemon as scraper_daemon
import runner.cli as runner_cli
from core.api_client import ClaimedChunk, JobConfig, ScraperConfig
from scrapers.parser import yaml_parser


def test_daemon_run_claimed_chunk_uses_runner_api_client_for_credential_resolution() -> None:
    client = MagicMock()
    client.runner_name = "runner-1"
    client.get_credentials.side_effect = AssertionError("daemon should not resolve credentials before delegating to runner")

    job_config = JobConfig(
        job_id="job-123",
        skus=["SKU-1"],
        scrapers=[ScraperConfig(name="phillips", credential_refs=["phillips"])],
        test_mode=False,
        max_workers=1,
    )
    client.get_job_config.return_value = job_config

    chunk = ClaimedChunk(
        chunk_id="chunk-1",
        job_id="job-123",
        chunk_index=0,
        skus=["SKU-1"],
        scrapers=["phillips"],
        test_mode=False,
        max_workers=1,
    )

    expected = {"data": {}, "skus_processed": 0}

    with patch("runner.run_job", return_value=expected) as mocked_run_job:
        result = scraper_daemon.run_claimed_chunk(chunk, client)

    assert result == expected
    assert job_config.scrapers[0].options is None
    mocked_run_job.assert_called_once_with(
        job_config,
        runner_name="runner-1",
        log_buffer=None,
        api_client=client,
        job_logging=None,
    )


def test_local_mode_uses_runner_api_client_for_credential_resolution(monkeypatch) -> None:
    config = SimpleNamespace(
        name="phillips",
        display_name=None,
        base_url="https://shop.phillipspet.com",
        search_url_template="https://shop.phillipspet.com/search?q={sku}",
        selectors=[],
        workflows=[],
        timeout=30,
        use_stealth=True,
        test_skus=["SKU-1"],
        retries=2,
        validation=None,
        login={"url": "https://shop.phillipspet.com/login"},
        credential_refs=["phillips"],
    )

    class FakeParser:
        def load_from_file(self, path: str) -> SimpleNamespace:
            assert path == "/tmp/phillips.yaml"
            return config

    client = MagicMock()
    client.get_credentials.side_effect = AssertionError("local mode should not resolve credentials before delegating to runner")

    captured: dict[str, object] = {}

    def fake_run_job(job_config, runner_name=None, api_client=None, **kwargs):
        _ = kwargs
        captured["job_config"] = job_config
        captured["runner_name"] = runner_name
        captured["api_client"] = api_client
        return {"data": {}, "skus_processed": 0}

    monkeypatch.setattr(yaml_parser, "ScraperConfigParser", FakeParser)
    monkeypatch.setattr(runner_cli.os.path, "isfile", lambda path: True)
    monkeypatch.setattr(runner_cli, "ScraperAPIClient", lambda **kwargs: client)
    monkeypatch.setattr(
        runner_cli.ConfigValidator,
        "validate_file",
        lambda self, path: SimpleNamespace(valid=True, errors=[], warnings=[], actionable_warnings=[], config_name="phillips", file_path=path, metadata={}),
    )
    monkeypatch.setattr(
        runner_cli,
        "validate_local_runtime_requirements",
        lambda *args, **kwargs: runner_cli.LocalRuntimePreflight(valid=True, config_path="/tmp/phillips.yaml", config_name="phillips"),
    )

    args = SimpleNamespace(
        config="/tmp/phillips.yaml",
        sku="SKU-1",
        output=None,
        no_headless=False,
        strict_validate=False,
        validate=False,
    )

    with patch("runner.run_job", side_effect=fake_run_job), patch("builtins.print"):
        runner_cli.run_local_mode(args)

    assert captured["runner_name"] == "local-cli"
    assert captured["api_client"] is client
    scraper_cfg = captured["job_config"].scrapers[0]
    assert scraper_cfg.credential_refs == ["phillips"]
    assert scraper_cfg.options is not None
    assert "_credentials" not in scraper_cfg.options


def test_validate_local_config_reports_invalid_top_level_yaml(tmp_path, capsys) -> None:
    config_path = tmp_path / "invalid.yaml"
    _ = config_path.write_text("- just\n- a\n- list\n", encoding="utf-8")

    exit_code = runner_cli.validate_local_config(
        argparse.Namespace(
            config=str(config_path),
            strict_validate=False,
        )
    )

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "Top-level YAML document must be an object, got list" in captured.out


# =============================================================================
# Deprecated job type rejection tests
# =============================================================================


def _make_minimal_job_config(job_type: str) -> JobConfig:
    """Create a minimal JobConfig with the given job type and an official_brand scraper.

    The official_brand scraper ensures the job enters _run_official_brand_job()
    where deprecation checks live.
    """
    return JobConfig(
        job_id="job-reject-1",
        skus=["SKU-001"],
        scrapers=[ScraperConfig(name="official_brand")],
        test_mode=False,
        max_workers=1,
        job_type=job_type,
    )


def test_ai_search_job_type_rejected() -> None:
    """ai_search job type must be rejected with a deprecation error."""
    from runner.__init__ import _run_official_brand_job

    job_config = _make_minimal_job_config("ai_search")
    results = _run_official_brand_job(
        job_config=job_config,
        skus=job_config.skus,
        results={"data": {}, "skus_processed": 0},
        log_buffer=[],
    )

    assert results["skus_processed"] == len(job_config.skus)
    assert results["skus_failed"] == len(job_config.skus)
    assert "deprecated" in results.get("error_message", "").lower()
    assert "direct_url_extraction" in results.get("error_message", "")


def test_official_brand_extraction_job_type_rejected() -> None:
    """official_brand_extraction job type must be rejected with a deprecation error."""
    from runner.__init__ import _run_official_brand_job

    job_config = _make_minimal_job_config("official_brand_extraction")
    results = _run_official_brand_job(
        job_config=job_config,
        skus=job_config.skus,
        results={"data": {}, "skus_processed": 0},
        log_buffer=[],
    )

    assert results["skus_failed"] == len(job_config.skus)
    assert "deprecated" in results.get("error_message", "").lower()


def test_official_brand_url_discovery_job_type_rejected() -> None:
    """official_brand_url_discovery job type must be rejected."""
    from runner.__init__ import _run_official_brand_job

    job_config = _make_minimal_job_config("official_brand_url_discovery")
    results = _run_official_brand_job(
        job_config=job_config,
        skus=job_config.skus,
        results={"data": {}, "skus_processed": 0},
        log_buffer=[],
    )

    assert results["skus_failed"] == len(job_config.skus)
    message = results.get("error_message", "")
    assert "server-side" in message.lower() or "discover" in message.lower()


def test_legacy_combined_raw_phase_rejected() -> None:
    """legacy_combined raw_phase must be rejected with a deprecation error."""
    from runner.__init__ import _run_official_brand_job

    # legacy_combined matches via raw_phase check inside _run_official_brand_job
    # when job_type is not official_brand_url_discovery.
    # Use "standard" job_type and set phase in job_config dict.
    job_config = JobConfig(
        job_id="job-legacy-1",
        skus=["SKU-001"],
        scrapers=[ScraperConfig(name="official_brand")],
        test_mode=False,
        max_workers=1,
        job_type="standard",
        job_config={"phase": "legacy_combined"},
    )
    results = _run_official_brand_job(
        job_config=job_config,
        skus=job_config.skus,
        results={"data": {}, "skus_processed": 0},
        log_buffer=[],
    )

    assert results["skus_failed"] == len(job_config.skus)
    assert "deprecated" in results.get("error_message", "").lower()
    assert "direct_url_extraction" in results.get("error_message", "")



