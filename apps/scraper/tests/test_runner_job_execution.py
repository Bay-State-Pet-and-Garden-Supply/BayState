from __future__ import annotations

from unittest.mock import MagicMock, patch

from core.api_client import ConfigFetchError as APIConfigFetchError
from core.api_client import JobConfig
from core.api_client import ScraperConfig
from core.config_fetcher import ConfigValidationError
from runner.job_execution import execute_claimed_job


def _make_job_config(*, lease_token: str | None = "lease-1") -> JobConfig:
    return JobConfig(
        job_id="job-1",
        skus=["SKU-1", "SKU-2"],
        scrapers=[ScraperConfig(name="amazon"), ScraperConfig(name="target")],
        test_mode=False,
        max_workers=2,
        lease_token=lease_token,
    )


def test_execute_claimed_job_success_submits_results_and_returns_results() -> None:
    client = MagicMock()
    client.get_job_config.return_value = _make_job_config()
    job_logging = MagicMock()
    results = {"data": {"SKU-1": {"amazon": {"Name": "Example"}}}, "skus_processed": 1}

    with patch("runner.job_execution.run_job", return_value=results) as mocked_run_job:
        success, returned_results = execute_claimed_job(
            client=client,
            job_id="job-1",
            runner_name="runner-1",
            trace_id="trace-1",
            job_logging=job_logging,
            config_fetch_progress=5,
            config_fetch_phase="configuring",
            config_loaded_progress=10,
            config_loaded_details_builder=lambda job_config: {
                "skus": len(job_config.skus),
                "scrapers": [scraper.name for scraper in job_config.scrapers],
            },
            config_loaded_items_total_builder=lambda job_config: len(job_config.skus),
        )

    assert success is True
    assert returned_results == results
    client.update_status.assert_called_once_with("job-1", "running", runner_name="runner-1")
    mocked_run_job.assert_called_once_with(
        client.get_job_config.return_value,
        runner_name="runner-1",
        api_client=client,
        job_logging=job_logging,
    )
    assert job_logging.emit_progress.call_args_list[0].kwargs == {
        "status": "running",
        "progress": 5,
        "message": "Fetching job configuration",
        "phase": "configuring",
    }
    assert job_logging.emit_progress.call_args_list[1].kwargs == {
        "status": "running",
        "progress": 10,
        "message": "Configuration loaded",
        "phase": "configuring",
        "details": {"skus": 2, "scrapers": ["amazon", "target"]},
        "items_total": 2,
    }
    client.submit_results.assert_called_once_with(
        "job-1",
        "completed",
        runner_name="runner-1",
        lease_token="lease-1",
        results=results,
    )


def test_execute_claimed_job_submits_failed_results_when_config_is_missing() -> None:
    client = MagicMock()
    client.get_job_config.return_value = None
    job_logging = MagicMock()

    success, returned_results = execute_claimed_job(
        client=client,
        job_id="job-1",
        runner_name="runner-1",
        trace_id="trace-1",
        job_logging=job_logging,
        initial_lease_token="lease-from-claim",
        config_fetch_progress=0,
        config_fetch_phase="starting",
        config_loaded_progress=5,
    )

    assert success is False
    assert returned_results is None
    assert job_logging.emit_progress.call_args_list[0].kwargs == {
        "status": "running",
        "progress": 0,
        "message": "Fetching job configuration",
        "phase": "starting",
    }
    assert job_logging.emit_progress.call_args_list[1].kwargs == {
        "status": "failed",
        "progress": 0,
        "message": "Failed to fetch job configuration",
        "phase": "configuring",
    }
    client.submit_results.assert_called_once_with(
        "job-1",
        "failed",
        runner_name="runner-1",
        lease_token="lease-from-claim",
        error_message="Failed to fetch job configuration",
    )


def test_execute_claimed_job_submits_validation_failures_with_config_details() -> None:
    client = MagicMock()
    client.get_job_config.return_value = _make_job_config()
    job_logging = MagicMock()
    validation_error = ConfigValidationError(
        "Invalid published config",
        config_slug="phillips",
        schema_version="2.0",
        validation_errors=[],
    )

    with patch("runner.job_execution.run_job", side_effect=validation_error):
        success, returned_results = execute_claimed_job(
            client=client,
            job_id="job-1",
            runner_name="runner-1",
            trace_id="trace-1",
            job_logging=job_logging,
            config_fetch_progress=0,
            config_fetch_phase="starting",
            config_loaded_progress=5,
        )

    assert success is False
    assert returned_results is None
    assert job_logging.emit_progress.call_args_list[-1].kwargs == {
        "status": "failed",
        "progress": 0,
        "message": "Config validation failed: Invalid published config (slug=phillips, schema_version=2.0)",
        "phase": "configuring",
        "details": {"config_slug": "phillips", "schema_version": "2.0"},
    }
    client.submit_results.assert_called_once_with(
        "job-1",
        "failed",
        runner_name="runner-1",
        lease_token="lease-1",
        error_message="Config validation failed for phillips: Invalid published config (slug=phillips, schema_version=2.0)",
    )


def test_execute_claimed_job_submits_config_fetch_failures() -> None:
    client = MagicMock()
    client.get_job_config.return_value = _make_job_config()
    job_logging = MagicMock()
    fetch_error = APIConfigFetchError("Failed to fetch config", config_slug="phillips")

    with patch("runner.job_execution.run_job", side_effect=fetch_error):
        success, returned_results = execute_claimed_job(
            client=client,
            job_id="job-1",
            runner_name="runner-1",
            trace_id="trace-1",
            job_logging=job_logging,
            config_fetch_progress=0,
            config_fetch_phase="starting",
            config_loaded_progress=5,
        )

    assert success is False
    assert returned_results is None
    assert job_logging.emit_progress.call_args_list[-1].kwargs == {
        "status": "failed",
        "progress": 0,
        "message": "Config fetch failed: Failed to fetch config",
        "phase": "configuring",
        "details": {"config_slug": "phillips"},
    }
    client.submit_results.assert_called_once_with(
        "job-1",
        "failed",
        runner_name="runner-1",
        lease_token="lease-1",
        error_message="Config fetch failed: Failed to fetch config",
    )


def test_execute_claimed_job_submits_generic_failures() -> None:
    client = MagicMock()
    client.get_job_config.return_value = _make_job_config(lease_token=None)
    job_logging = MagicMock()

    with patch("runner.job_execution.run_job", side_effect=RuntimeError("boom")):
        success, returned_results = execute_claimed_job(
            client=client,
            job_id="job-1",
            runner_name="runner-1",
            trace_id="trace-1",
            job_trace_id="job-trace-1",
            job_logging=job_logging,
            initial_lease_token="lease-from-claim",
            config_fetch_progress=5,
            config_fetch_phase="configuring",
            config_loaded_progress=10,
            generic_failure_log_message="Realtime job failed with error",
        )

    assert success is False
    assert returned_results is None
    assert job_logging.emit_progress.call_args_list[-1].kwargs == {
        "status": "failed",
        "progress": 0,
        "message": "Job failed: boom",
        "phase": "failed",
        "details": {"error_type": "RuntimeError"},
    }
    client.submit_results.assert_called_once_with(
        "job-1",
        "failed",
        runner_name="runner-1",
        lease_token="lease-from-claim",
        error_message="boom",
    )
