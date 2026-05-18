from unittest.mock import patch, MagicMock
from core.api_client import ClaimedEnrichment
from runner import _submit_result

class MockEnrichmentResult:
    def __init__(self, status="success"):
        self.status = status

    def model_dump_json(self):
        return '{"mock": "result"}'

    def model_dump(self):
        return {"mock": "result"}


def test_submit_result_uses_attempt_id_from_object():
    """Verify _submit_result fetches attempt_id from the ClaimedEnrichment object, even when job_payload is empty."""
    api_client = MagicMock()
    api_client.submit_enrichment_result.return_value = True

    attempt = ClaimedEnrichment(
        attempt_id="real-attempt-123",
        job_id="job-abc",
        sku="sku-999",
        target_url="http://example.com",
        lease_token="lease-xyz",
    )

    # Note that job_payload (which represents job_config) has NO attempt_id
    job_payload = {"scrapers": ["phillips"]}
    enrichment_result = MockEnrichmentResult(status="success")

    with patch("runner.logger") as mock_logger:
        _submit_result(api_client, attempt, job_payload, enrichment_result)

        # Verify submission happened with the correct attempt_id from ClaimedEnrichment object
        api_client.submit_enrichment_result.assert_called_once_with(
            attempt_id="real-attempt-123",
            status="success",
            result_json='{"mock": "result"}',
            lease_token="lease-xyz",
        )
        mock_logger.warning.assert_not_called()


def test_submit_result_falls_back_to_job_payload():
    """Verify _submit_result falls back to fetching attempt_id from job_payload if not present on attempt (for backcompat/mocking)."""
    api_client = MagicMock()
    api_client.submit_enrichment_result.return_value = True

    # attempt lacks attempt_id or has it empty/None
    class LegacyAttempt:
        def __init__(self):
            self.job_id = "job-abc"
            self.sku = "sku-999"
            self.target_url = "http://example.com"
            self.lease_token = "lease-xyz"

    attempt = LegacyAttempt()
    job_payload = {"attempt_id": "fallback-attempt-456"}
    enrichment_result = MockEnrichmentResult(status="success")

    with patch("runner.logger") as mock_logger:
        _submit_result(api_client, attempt, job_payload, enrichment_result)

        # Verify submission happened with the fallback attempt_id
        api_client.submit_enrichment_result.assert_called_once_with(
            attempt_id="fallback-attempt-456",
            status="success",
            result_json='{"mock": "result"}',
            lease_token="lease-xyz",
        )
        mock_logger.warning.assert_not_called()


def test_submit_result_fails_gracefully_when_no_attempt_id():
    """Verify _submit_result fails gracefully and logs warning when no attempt_id is available anywhere."""
    api_client = MagicMock()

    class BadAttempt:
        pass

    attempt = BadAttempt()
    job_payload = {}
    enrichment_result = MockEnrichmentResult(status="success")

    with patch("runner.logger") as mock_logger:
        _submit_result(api_client, attempt, job_payload, enrichment_result)

        api_client.submit_enrichment_result.assert_not_called()
        mock_logger.warning.assert_called_once_with("No attempt_id found — enrichment result not submitted")
