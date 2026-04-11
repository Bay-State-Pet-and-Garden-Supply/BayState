from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import daemon as scraper_daemon
import runner.cli as runner_cli
from core.api_client import ClaimedChunk
from core.api_client import JobConfig
from core.api_client import ScraperConfig
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

    args = SimpleNamespace(
        config="/tmp/phillips.yaml",
        sku="SKU-1",
        output=None,
        no_headless=False,
    )

    with patch("runner.run_job", side_effect=fake_run_job), patch("builtins.print"):
        runner_cli.run_local_mode(args)

    assert captured["runner_name"] == "local-cli"
    assert captured["api_client"] is client
    scraper_cfg = captured["job_config"].scrapers[0]
    assert scraper_cfg.credential_refs == ["phillips"]
    assert scraper_cfg.options is not None
    assert "_credentials" not in scraper_cfg.options
