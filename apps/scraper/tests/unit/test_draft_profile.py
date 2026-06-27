"""Tests for draft_site_extraction_profile and validate_profile_version runner handlers."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.api_client import ClaimedProfileMaintenanceJob
from runner.profile_maintenance import run_profile_maintenance_job


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_job(
    kind: str = "draft_site_extraction_profile",
    **payload_overrides,
) -> ClaimedProfileMaintenanceJob:
    payload = {
        "profile_id": "prof-1",
        "brand_id": "brand-1",
        "source_slug": "test-brand",
        "canonical_domain": "example.com",
        "verified_seed_ids": ["seed-1", "seed-2"],
        "verified_seed_urls": [
            "https://example.com/pdp/1",
            "https://example.com/pdp/2",
        ],
        **payload_overrides,
    }
    return ClaimedProfileMaintenanceJob(
        job_id="job-1",
        kind=kind,
        profile_id="prof-1",
        canonical_domain="example.com",
        payload=payload,
        lease_token="tok-1",
    )


def _make_validate_job(**payload_overrides) -> ClaimedProfileMaintenanceJob:
    payload = {
        "profile_version_id": "pv-1",
        "profile_id": "prof-1",
        "validation_set_id": "set-1",
        "validation_run_id": "run-1",
        "compiled_crawl4ai_schema": {
            "name": "Product extraction",
            "baseSelector": "body",
            "fields": [
                {"name": "title", "selector": "h1", "type": "text"},
                {"name": "price", "selector": ".price", "type": "text"},
            ],
        },
        "rules": {"profile_version": "v1", "fields": []},
        "validation_cases": [
            {
                "id": "case-1",
                "case_type": "seed",
                "target_url": "https://example.com/pdp/1",
                "expected_assertions": {"page_type": "product_detail_page"},
            },
        ],
        **payload_overrides,
    }
    return ClaimedProfileMaintenanceJob(
        job_id="job-2",
        kind="validate_profile_version",
        profile_id="prof-1",
        profile_version_id="pv-1",
        canonical_domain="example.com",
        payload=payload,
        lease_token="tok-2",
    )


def _make_crawl_result(**kwargs) -> MagicMock:
    """Create a mock CrawlResult-like object with the given attributes."""
    m = MagicMock()
    defaults = {
        "url": "https://example.com/",
        "success": True,
        "error": None,
        "html": "<html><body></body></html>",
        "cleaned_html": None,
        "metadata": {},
        "media": {"images": []},
        "links": {"internal": [], "external": []},
        "extracted_content": None,
    }
    for key, val in {**defaults, **kwargs}.items():
        setattr(m, key, val)
    return m


class _AsyncCrawlerMock:
    """Async context manager that wraps an AsyncMock for AsyncWebCrawler."""

    def __init__(self):
        self.instance = AsyncMock()
        self.instance.arun = AsyncMock()

    async def __aenter__(self):
        return self.instance

    async def __aexit__(self, *args):
        pass


class _AsyncEngineMock:
    """Async context manager that wraps an AsyncMock for Crawl4AIEngine."""

    def __init__(self):
        self.instance = AsyncMock()
        self.instance.crawl = AsyncMock()
        self.instance.initialize = AsyncMock()
        self.instance.cleanup = AsyncMock()

    async def __aenter__(self):
        return self.instance

    async def __aexit__(self, *args):
        pass


# ---------------------------------------------------------------------------
# Draft handler tests
# ---------------------------------------------------------------------------


class TestDraftSiteExtractionProfile:
    """Tests for _run_draft_site_extraction_profile."""

    def test_missing_profile_id_returns_failed(self):
        """Job without profile_id returns failed status."""
        job = _make_job(profile_id="")
        result = self._run(job)
        assert result["status"] == "failed"
        assert "profile_id" in result["error_message"].lower()

    def test_no_seed_urls_returns_failed(self):
        """Job without verified_seed_urls returns failed."""
        job = _make_job(verified_seed_urls=[])
        result = self._run(job)
        assert result["status"] == "failed"
        assert "seed" in result["error_message"].lower()

    @pytest.mark.asyncio
    async def test_crawl_failure_returns_rejected(self):
        """When all seeds fail to crawl, result is rejected."""
        crawler_mock = _AsyncCrawlerMock()
        crawler_mock.instance.arun.return_value = _make_crawl_result(
            url="https://example.com/pdp/1",
            success=False,
            error="Connection timeout",
        )

        with patch("runner.profile_maintenance.AsyncWebCrawler", return_value=crawler_mock):
            job = _make_job()
            result = await run_profile_maintenance_job(job)

        assert result["status"] == "succeeded"
        assert result["result"]["draft_status"] == "rejected"
        assert "failed to crawl" in result["result"]["rejection_reason"].lower()

    @pytest.mark.asyncio
    async def test_pdp_page_generates_schema(self):
        """PDP page with valid HTML generates schema successfully."""
        engine_mock = _AsyncEngineMock()
        engine_mock.instance.crawl.return_value = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "error": None,
            "html": """<html><head><title>Test Product - Brand</title>
<meta property="og:type" content="product">
<meta property="og:image" content="https://example.com/product.jpg">
</head><body>
<h1>Test Product</h1>
<span class="price">$29.99</span>
<span class="sku">SKU-123</span>
</body></html>""",
            "cleaned_html": None,
            "metadata": {"title": "Test Product - Brand"},
            "media": {"images": []},
            "links": {"internal": [], "external": []},
        }

        with patch("runner.profile_maintenance.Crawl4AIEngine", return_value=engine_mock):
            job = _make_job()
            result = await run_profile_maintenance_job(job)

        assert result["status"] == "succeeded"
        assert result["result"]["draft_status"] == "generated"
        assert result["result"]["seed_url_used"] == "https://example.com/pdp/1"
        assert result["result"]["field_count"] > 0

        # Verify artifact payload structure
        artifact = result["artifact"]
        assert artifact["kind"] == "draft_site_extraction_profile"
        assert artifact["schema_version"] == "1"

        payload = artifact["payload"]
        assert payload["draft_status"] == "generated"
        assert payload["profile_id"] == "prof-1"
        assert "field_evidence_rules" in payload
        assert "compiled_crawl4ai_schema" in payload
        assert "version_hash" in payload

        # Verify version_hash is deterministic
        assert isinstance(payload["version_hash"], str)
        assert len(payload["version_hash"]) == 64  # SHA256 hex

    @pytest.mark.asyncio
    async def test_generated_schema_has_expected_structure(self):
        """Generated schema has baseSelector and fields array."""
        engine_mock = _AsyncEngineMock()
        engine_mock.instance.crawl.return_value = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "error": None,
            "html": """<html><head>
<meta property="og:type" content="product">
</head><body>
<h1>Test Product</h1>
<span class="price">$29.99</span>
</body></html>""",
            "cleaned_html": None,
            "metadata": {"title": "Test Product"},
            "media": {"images": []},
            "links": {"internal": [], "external": []},
        }

        with patch("runner.profile_maintenance.Crawl4AIEngine", return_value=engine_mock):
            job = _make_job()
            result = await run_profile_maintenance_job(job)

        payload = result["artifact"]["payload"]
        schema = payload["compiled_crawl4ai_schema"]

        # Schema should have name, baseSelector, and fields
        assert "name" in schema
        assert "baseSelector" in schema or isinstance(schema.get("baseSelector"), str)
        assert "fields" in schema
        assert isinstance(schema["fields"], list)

        # Field Evidence Rules should have the right wrapper
        rules = payload["field_evidence_rules"]
        assert "profile_version" in rules
        assert "schema_version" in rules
        assert "generated_from" in rules
        assert rules["generated_from"] == "ai_schema_draft"
        assert "fields" in rules
        assert isinstance(rules["fields"], list)

        # Each field should have field_name, selector, type
        for field in rules["fields"]:
            assert "field_name" in field
            assert "selector" in field
            assert "type" in field

    @pytest.mark.asyncio
    async def test_version_hash_is_deterministic(self):
        """Same input produces same version_hash."""
        engine_mock = _AsyncEngineMock()
        engine_mock.instance.crawl.return_value = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "error": None,
            "html": "<html><body><h1>Test Product</h1><span class='price'>$29.99</span></body></html>",
            "cleaned_html": None,
            "metadata": {"title": "Test Product"},
            "media": {"images": []},
            "links": {"internal": [], "external": []},
        }

        with patch("runner.profile_maintenance.Crawl4AIEngine", return_value=engine_mock):
            job = _make_job()
            result1 = await run_profile_maintenance_job(job)
            result2 = await run_profile_maintenance_job(job)

        hash1 = result1["artifact"]["payload"]["version_hash"]
        hash2 = result2["artifact"]["payload"]["version_hash"]
        assert hash1 == hash2

    @pytest.mark.asyncio
    async def test_field_evidence_rules_wrapper_is_correctly_shaped(self):
        """Field Evidence Rules wrapper has correct BayState format."""
        crawler_mock = _AsyncCrawlerMock()
        crawler_mock.instance.arun.return_value = _make_crawl_result(
            url="https://example.com/pdp/1",
            html="""<html><body>
<div class="product-title">Test Product</div>
<span class="price">$29.99</span>
<img class="product-image" src="img.jpg" />
</body></html>""",
            metadata={"title": "Test Product"},
        )

        with patch("runner.profile_maintenance.AsyncWebCrawler", return_value=crawler_mock):
            job = _make_job()
            result = await run_profile_maintenance_job(job)

        rules = result["artifact"]["payload"]["field_evidence_rules"]
        assert rules["profile_version"] == "v1"
        assert rules["schema_version"] == "1"
        assert rules["generated_from"] == "ai_schema_draft"
        assert rules["seed_url"] == "https://example.com/pdp/1"
        assert rules["canonical_domain"] == "example.com"
        assert "compiled_crawl4ai_schema" in rules

        # Check field mapping
        field_names = [f["field_name"] for f in rules["fields"]]
        assert "title" in field_names
        assert "price" in field_names

    # ---- Test runner helper ----

    @staticmethod
    def _run(job) -> dict:
        """Run a handler synchronously (non-async tests)."""
        import asyncio

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(run_profile_maintenance_job(job))
        finally:
            loop.close()


# ---------------------------------------------------------------------------
# Validate handler tests
# ---------------------------------------------------------------------------


class TestValidateProfileVersion:
    """Tests for _run_validate_profile_version."""

    @pytest.mark.asyncio
    async def test_all_cases_pass_returns_passed(self):
        """All validation cases pass -> validation_status = passed."""
        import json
        crawler_mock = _AsyncCrawlerMock()
        crawler_mock.instance.arun.return_value = _make_crawl_result(
            url="https://example.com/pdp/1",
            success=True,
            html="""<html><head>
<meta property="og:type" content="product">
<script type="application/ld+json">{"@type":"Product","name":"Test Product"}</script>
</head><body>
<h1>Test Product</h1>
<form method="POST" action="/cart/add"><button>Add to Cart</button></form>
<span class="price">$29.99</span>
</body></html>""",
            metadata={"title": "Test Product"},
            extracted_content=json.dumps([{"title": "Test Product", "price": "$29.99"}]),
        )

        with patch("runner.profile_maintenance.AsyncWebCrawler", return_value=crawler_mock):
            job = _make_validate_job()
            result = await run_profile_maintenance_job(job)

        assert result["status"] == "succeeded"
        assert result["result"]["validation_status"] == "passed"
        assert result["result"]["summary"]["passed"] == 1
        assert result["result"]["summary"]["failed"] == 0

    @pytest.mark.asyncio
    async def test_crawl_failure_classified_correctly(self):
        """Crawl failure is classified as crawl_failure."""
        crawler_mock = _AsyncCrawlerMock()
        crawler_mock.instance.arun.return_value = _make_crawl_result(
            url="https://example.com/pdp/1",
            success=False,
            error="503 Service Unavailable",
        )

        with patch("runner.profile_maintenance.AsyncWebCrawler", return_value=crawler_mock):
            job = _make_validate_job()
            result = await run_profile_maintenance_job(job)

        assert result["status"] == "succeeded"
        assert result["result"]["validation_status"] == "failed"
        assert result["result"]["summary"]["failed"] == 1
        assert result["result"]["summary"]["failure_breakdown"]["crawl_failure"] == 1
        assert result["result"]["results"][0]["failure_type"] == "crawl_failure"

    @pytest.mark.asyncio
    async def test_empty_case_list_returns_failed(self):
        """Empty validation case list returns failed with zero cases."""
        job = _make_validate_job(validation_cases=[])
        result = await run_profile_maintenance_job(job)

        assert result["status"] == "succeeded"
        assert result["result"]["validation_status"] == "failed"
        assert result["result"]["summary"]["total"] == 0
        assert result["result"]["summary"]["passed"] == 0
        assert result["result"]["validation_mode"] == "fixture"

    @pytest.mark.asyncio
    async def test_artifact_has_correct_structure(self):
        """Validation artifact payload has expected shape."""
        import json
        crawler_mock = _AsyncCrawlerMock()
        crawler_mock.instance.arun.return_value = _make_crawl_result(
            url="https://example.com/pdp/1",
            success=True,
            html="""<html><head>
<meta property="og:type" content="product">
<meta property="og:image" content="https://example.com/img.jpg">
<script type="application/ld+json">{"@type":"Product","name":"Test Product"}</script>
</head><body>
<h1>Test Product</h1>
<form method="POST" action="/cart/add"><button>Add to Cart</button></form>
<span class="price">$29.99</span>
</body></html>""",
            metadata={"title": "Test Product"},
            extracted_content=json.dumps([{"title": "Test Product", "price": "$29.99"}]),
        )

        with patch("runner.profile_maintenance.AsyncWebCrawler", return_value=crawler_mock):
            job = _make_validate_job()
            result = await run_profile_maintenance_job(job)

        assert result["artifact"]["kind"] == "validate_profile_version"
        assert result["artifact"]["schema_version"] == "1"

        payload = result["artifact"]["payload"]
        assert payload["validation_status"] == "passed"
        assert payload["profile_version_id"] == "pv-1"
        assert payload["validation_run_id"] == "run-1"
        assert "summary" in payload
        assert payload["summary"]["total"] >= 0
        assert payload["summary"]["passed"] >= 0
        assert payload["summary"]["failed"] >= 0
        assert "failure_breakdown" in payload["summary"]
        assert "results" in payload
        assert isinstance(payload["results"], list)

        # Each result should have case_id, target_url, pass, failure_type
        if payload["results"]:
            case_result = payload["results"][0]
            assert "case_id" in case_result
            assert "target_url" in case_result
            assert "pass" in case_result
