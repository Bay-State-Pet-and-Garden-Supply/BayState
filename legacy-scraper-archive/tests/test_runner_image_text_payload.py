from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from core.api_client import JobConfig, ScraperConfig
from runner.__init__ import run_job


def test_image_text_field_passed_through_to_payload() -> None:
    """Verify that 'Image Text' from extracted_data is included in the final
    payload after run_job() processes a successful scrape result."""
    # Fake result from the workflow executor that includes Image Text
    fake_scrape_result = {
        "success": True,
        "results": {
            "Name": "Test Product",
            "Brand": "Test Brand",
            "Image Text": "front label text",
        },
    }

    # Mock the WorkflowExecutor so no real Playwright browser is started
    mock_executor = MagicMock()
    mock_executor.browser = MagicMock()
    mock_executor.browser.current_url = "http://example.com/product"
    mock_executor.browser.quit = AsyncMock()
    mock_executor.initialize = AsyncMock()
    mock_executor.execute_workflow = AsyncMock(return_value=fake_scrape_result)

    job_config = JobConfig(
        job_id="test-image-text-001",
        skus=["TEST-SKU-001"],
        scrapers=[
            ScraperConfig(
                name="test-scraper",
                base_url="http://example.com",
            ),
        ],
        test_mode=False,
        max_workers=1,
    )

    with patch("runner.__init__.WorkflowExecutor", return_value=mock_executor):
        results = run_job(job_config, runner_name="test")

    # The payload should contain the image_text field with the OCR text
    payload = results["data"]["TEST-SKU-001"]["test-scraper"]
    assert payload["image_text"] == "front label text"
