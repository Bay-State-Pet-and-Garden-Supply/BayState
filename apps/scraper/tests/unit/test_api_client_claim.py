"""
Tests for ScraperAPIClient.claim_enrichment().

Verifies:
- max_attempts: 1 is sent in the request body
- runner_name is included
- ClaimedEnrichment is correctly populated from the response
- No attempts available returns None
"""

from __future__ import annotations

import json
from unittest.mock import patch

from core.api_client import ScraperAPIClient, ClaimedEnrichment


def test_claim_enrichment_sends_max_attempts_one():
    """claim_enrichment must send max_attempts: 1 in the request payload."""
    client = ScraperAPIClient(
        api_url="http://test.local",
        api_key="test-key",
        runner_name="test-runner",
    )

    mock_response = {
        "attempts": [
            {
                "id": "att-1",
                "job_id": "job-1",
                "upc": "001135",
                "source_url": "https://www.bradleycaldwell.com/search?term=001135",
                "domain": "bradleycaldwell.com",
                "mode": "mixed",
                "model": None,
                "target_id": None,
                "config": {"source_type": "approved_source_extraction"},
                "ai_credentials": None,
                "lease_token": "tok-1",
                "lease_expires_at": "2026-01-01T00:00:00Z",
                "test_mode": False,
                "source_plan": {"upc": "001135", "schemaVersion": "v1", "extractionMode": "distributor_only"},
            }
        ]
    }

    with patch.object(client, "_make_request", return_value=mock_response) as mock_req:
        result = client.claim_enrichment("test-runner")

        # Verify _make_request was called with correct args
        mock_req.assert_called_once()
        call_kwargs = mock_req.call_args.kwargs
        payload_str = call_kwargs.get("payload", "")
        payload = json.loads(payload_str)

        assert payload["max_attempts"] == 1, (
            f"Expected max_attempts=1, got {payload.get('max_attempts')}"
        )
        assert payload["runner_name"] == "test-runner", (
            f"Expected runner_name='test-runner', got {payload.get('runner_name')}"
        )

        # Verify result is populated
        assert result is not None
        assert isinstance(result, ClaimedEnrichment)
        assert result.attempt_id == "att-1"
        assert result.job_id == "job-1"
        assert result.upc == "001135"
        assert result.target_url == "https://www.bradleycaldwell.com/search?term=001135"
        assert result.domain == "bradleycaldwell.com"
        assert result.mode == "mixed"
        assert result.model is None
        assert result.target_id is None
        assert result.job_config == {"source_type": "approved_source_extraction"}
        assert result.ai_credentials is None
        assert result.lease_token == "tok-1"
        assert result.lease_expires_at == "2026-01-01T00:00:00Z"
        assert result.test_mode is False
        assert result.source_plan == {"upc": "001135", "schemaVersion": "v1", "extractionMode": "distributor_only"}


def test_claim_enrichment_returns_none_when_no_attempts():
    """When the response has no attempts, claim_enrichment returns None."""
    client = ScraperAPIClient(
        api_url="http://test.local",
        api_key="test-key",
        runner_name="test-runner",
    )

    with patch.object(client, "_make_request", return_value={"attempts": []}) as mock_req:
        result = client.claim_enrichment("test-runner")

        mock_req.assert_called_once()
        assert result is None


def test_claim_enrichment_uses_default_runner_name():
    """When no runner_name is passed, uses the client's default."""
    client = ScraperAPIClient(
        api_url="http://test.local",
        api_key="test-key",
        runner_name="default-runner",
    )

    with patch.object(client, "_make_request", return_value={"attempts": []}) as mock_req:
        client.claim_enrichment()

        call_kwargs = mock_req.call_args.kwargs
        payload_str = call_kwargs.get("payload", "")
        payload = json.loads(payload_str)
        assert payload["runner_name"] == "default-runner"


def test_claim_enrichment_handles_runner_name_override():
    """When runner_name is explicitly passed, it overrides the default."""
    client = ScraperAPIClient(
        api_url="http://test.local",
        api_key="test-key",
        runner_name="default-runner",
    )

    with patch.object(client, "_make_request", return_value={"attempts": []}) as mock_req:
        client.claim_enrichment("override-runner")

        call_kwargs = mock_req.call_args.kwargs
        payload_str = call_kwargs.get("payload", "")
        payload = json.loads(payload_str)
        assert payload["runner_name"] == "override-runner"


def test_claim_enrichment_no_url_returns_none():
    """When the client has no API URL, claim_enrichment returns None gracefully."""
    client = ScraperAPIClient(
        api_url="",
        api_key="test-key",
        runner_name="test-runner",
    )

    result = client.claim_enrichment("test-runner")
    assert result is None
