"""
Unit tests for SelectorHealthTracker.

Tests cover:
- Selector result tracking
- Success rate calculations
- Alert triggering
- JSON persistence
- 30-day rotation cleanup
- Integration hooks
"""

import json
import os
import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from core.selector_health import (
    DEFAULT_ALERT_THRESHOLD,
    DEFAULT_MIN_ATTEMPTS_FOR_ALERT,
    SelectorHealthRecord,
    SelectorHealthSummary,
    SelectorHealthTracker,
    SiteSelectorHealth,
    get_selector_health_tracker,
    reset_health_tracker,
)


class TestSelectorHealthRecord:
    """Tests for SelectorHealthRecord dataclass."""

    def test_record_creation(self):
        """Test creating a selector health record."""
        record = SelectorHealthRecord(
            selector=".price",
            site="amazon",
            timestamp=time.time(),
            success=True,
            duration_ms=150.0,
        )

        assert record.selector == ".price"
        assert record.site == "amazon"
        assert record.success is True
        assert record.duration_ms == 150.0
        assert record.error_type is None

    def test_record_to_dict(self):
        """Test converting record to dictionary."""
        record = SelectorHealthRecord(
            selector=".price",
            site="amazon",
            timestamp=1234567890.0,
            success=False,
            duration_ms=200.0,
            error_type="TimeoutError",
        )

        data = record.to_dict()
        assert data["selector"] == ".price"
        assert data["success"] is False
        assert data["error_type"] == "TimeoutError"

    def test_record_from_dict(self):
        """Test creating record from dictionary."""
        data = {
            "selector": ".title",
            "site": "ebay",
            "timestamp": 1234567890.0,
            "success": True,
            "duration_ms": 100.0,
            "error_type": None,
        }

        record = SelectorHealthRecord.from_dict(data)
        assert record.selector == ".title"
        assert record.site == "ebay"
        assert record.success is True


class TestSelectorHealthTrackerBasics:
    """Tests for basic SelectorHealthTracker functionality."""

    @pytest.fixture
    def temp_tracker(self):
        """Create a temporary tracker for testing."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        yield tracker

        # Cleanup
        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_tracker_initialization(self, temp_tracker):
        """Test that tracker initializes correctly."""
        assert temp_tracker.retention_days == 30
        assert temp_tracker.alert_threshold == 0.7
        assert temp_tracker.min_attempts_for_alert == 5
        assert temp_tracker._records == []
        assert temp_tracker._summaries == {}

    def test_track_single_success(self, temp_tracker):
        """Test tracking a single successful selector result."""
        summary = temp_tracker.track_selector_result(
            selector=".price",
            site="amazon",
            success=True,
            duration_ms=150.0,
        )

        assert summary is not None
        assert summary.selector == ".price"
        assert summary.site == "amazon"
        assert summary.total_attempts == 1
        assert summary.success_count == 1
        assert summary.failure_count == 0
        assert summary.success_rate == 1.0
        assert summary.average_duration_ms == 150.0

    def test_track_single_failure(self, temp_tracker):
        """Test tracking a single failed selector result."""
        summary = temp_tracker.track_selector_result(
            selector=".price",
            site="amazon",
            success=False,
            duration_ms=5000.0,
            error_type="TimeoutError",
        )

        assert summary is not None
        assert summary.total_attempts == 1
        assert summary.success_count == 0
        assert summary.failure_count == 1
        assert summary.success_rate == 0.0

    def test_track_multiple_results(self, temp_tracker):
        """Test tracking multiple results for same selector."""
        # 7 successes, 3 failures = 70% success rate
        for i in range(7):
            temp_tracker.track_selector_result(
                selector=".price",
                site="amazon",
                success=True,
                duration_ms=100.0 + i * 10,
            )

        for i in range(3):
            temp_tracker.track_selector_result(
                selector=".price",
                site="amazon",
                success=False,
                duration_ms=5000.0,
                error_type="TimeoutError",
            )

        summary = temp_tracker.get_selector_summary(".price", "amazon")
        assert summary.total_attempts == 10
        assert summary.success_count == 7
        assert summary.failure_count == 3
        assert summary.success_rate == 0.7

    def test_different_selectors_same_site(self, temp_tracker):
        """Test tracking different selectors on the same site."""
        temp_tracker.track_selector_result(".price", "amazon", True, 100.0)
        temp_tracker.track_selector_result(".title", "amazon", True, 150.0)
        temp_tracker.track_selector_result(".image", "amazon", False, 200.0)

        price_summary = temp_tracker.get_selector_summary(".price", "amazon")
        title_summary = temp_tracker.get_selector_summary(".title", "amazon")
        image_summary = temp_tracker.get_selector_summary(".image", "amazon")

        assert price_summary.success_rate == 1.0
        assert title_summary.success_rate == 1.0
        assert image_summary.success_rate == 0.0

    def test_same_selector_different_sites(self, temp_tracker):
        """Test tracking the same selector on different sites."""
        temp_tracker.track_selector_result(".price", "amazon", True, 100.0)
        temp_tracker.track_selector_result(".price", "ebay", False, 200.0)

        amazon_summary = temp_tracker.get_selector_summary(".price", "amazon")
        ebay_summary = temp_tracker.get_selector_summary(".price", "ebay")

        assert amazon_summary.success_rate == 1.0
        assert ebay_summary.success_rate == 0.0


class TestSelectorHealthCalculations:
    """Tests for success rate and duration calculations."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker for calculation tests."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=10,
        )

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_success_rate_calculation(self, tracker):
        """Test that success rate is calculated correctly."""
        # 50% success rate
        for _ in range(5):
            tracker.track_selector_result(".test", "site", True, 100.0)
        for _ in range(5):
            tracker.track_selector_result(".test", "site", False, 100.0)

        summary = tracker.get_selector_summary(".test", "site")
        assert summary.success_rate == 0.5

    def test_average_duration_calculation(self, tracker):
        """Test rolling average duration calculation."""
        durations = [100.0, 200.0, 300.0]
        for duration in durations:
            tracker.track_selector_result(".test", "site", True, duration)

        summary = tracker.get_selector_summary(".test", "site")
        expected_avg = sum(durations) / len(durations)
        assert summary.average_duration_ms == expected_avg

    def test_min_max_duration_tracking(self, tracker):
        """Test min/max duration tracking."""
        durations = [500.0, 100.0, 300.0, 200.0]
        for duration in durations:
            tracker.track_selector_result(".test", "site", True, duration)

        summary = tracker.get_selector_summary(".test", "site")
        assert summary.min_duration_ms == 100.0
        assert summary.max_duration_ms == 500.0

    def test_duration_updates_on_failure(self, tracker):
        """Test that duration is tracked for failures too."""
        tracker.track_selector_result(".test", "site", True, 100.0)
        tracker.track_selector_result(".test", "site", False, 5000.0)

        summary = tracker.get_selector_summary(".test", "site")
        assert summary.average_duration_ms == 2550.0  # (100 + 5000) / 2


class TestSelectorHealthAlerts:
    """Tests for alert triggering functionality."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker with low alert threshold for testing."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_alert_not_triggered_above_threshold(self, tracker):
        """Test that alert is not triggered when success rate is above threshold."""
        with patch("core.selector_health.logger") as mock_logger:
            # 80% success rate (above 70% threshold)
            for _ in range(8):
                tracker.track_selector_result(".test", "site", True, 100.0)
            for _ in range(2):
                tracker.track_selector_result(".test", "site", False, 100.0)

            # Should not log warning (alert)
            warning_calls = [
                call for call in mock_logger.warning.call_args_list
                if "SELECTOR_HEALTH" in str(call)
            ]
            assert len(warning_calls) == 0

    def test_alert_triggered_below_threshold(self, tracker):
        """Test that alert is triggered when success rate drops below threshold."""
        with patch("core.selector_health.logger") as mock_logger:
            # 50% success rate (below 70% threshold)
            for _ in range(5):
                tracker.track_selector_result(".test", "site", True, 100.0)
            for _ in range(5):
                tracker.track_selector_result(".test", "site", False, 100.0)

            # Should log warning (alert)
            warning_calls = [
                call for call in mock_logger.warning.call_args_list
                if "SELECTOR_HEALTH" in str(call.args[0] if call.args else "")
            ]
            assert len(warning_calls) > 0

    def test_alert_not_triggered_below_min_attempts(self, tracker):
        """Test that alert is not triggered before min_attempts threshold."""
        with patch("core.selector_health.logger") as mock_logger:
            # Only 3 attempts, all fail (0% success rate)
            # But min_attempts_for_alert is 5, so no alert
            for _ in range(3):
                tracker.track_selector_result(".test", "site", False, 100.0)

            # Should not log warning (alert)
            warning_calls = [
                call for call in mock_logger.warning.call_args_list
                if "SELECTOR_HEALTH" in str(call.args[0] if call.args else "")
            ]
            assert len(warning_calls) == 0

    def test_alert_triggered_at_exact_threshold(self, tracker):
        """Test that alert is triggered at exactly the threshold boundary."""
        with patch("core.selector_health.logger") as mock_logger:
            # 69% success rate (just below 70% threshold)
            for _ in range(69):
                tracker.track_selector_result(".test", "site", True, 100.0)
            for _ in range(31):
                tracker.track_selector_result(".test", "site", False, 100.0)

            # Should log warning (alert)
            warning_calls = [
                call for call in mock_logger.warning.call_args_list
                if "SELECTOR_HEALTH" in str(call.args[0] if call.args else "")
            ]
            assert len(warning_calls) > 0


class TestUnhealthySelectors:
    """Tests for getting unhealthy selectors."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker with test data."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        # Create various health states
        # Healthy selector (90%)
        for _ in range(9):
            tracker.track_selector_result(".healthy", "site1", True, 100.0)
        tracker.track_selector_result(".healthy", "site1", False, 100.0)

        # Degraded selector (70%)
        for _ in range(7):
            tracker.track_selector_result(".degraded", "site1", True, 100.0)
        for _ in range(3):
            tracker.track_selector_result(".degraded", "site1", False, 100.0)

        # Failing selector (50%)
        for _ in range(5):
            tracker.track_selector_result(".failing", "site1", True, 100.0)
        for _ in range(5):
            tracker.track_selector_result(".failing", "site1", False, 100.0)

        # Completely failing (0%)
        for _ in range(10):
            tracker.track_selector_result(".dead", "site1", False, 100.0)

        # Different site
        for _ in range(3):
            tracker.track_selector_result(".failing", "site2", True, 100.0)
        for _ in range(7):
            tracker.track_selector_result(".failing", "site2", False, 100.0)

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_get_unhealthy_selectors(self, tracker):
        """Test getting all unhealthy selectors."""
        unhealthy = tracker.get_unhealthy_selectors()

        # Should return dead (0%), failing site2 (30%), failing site1 (50%)
        assert len(unhealthy) == 3
        selectors = [s.selector for s in unhealthy]
        assert ".failing" in selectors
        assert ".dead" in selectors
        assert ".healthy" not in selectors
        assert ".degraded" not in selectors

    def test_get_unhealthy_by_site(self, tracker):
        """Test getting unhealthy selectors filtered by site."""
        site2_unhealthy = tracker.get_unhealthy_selectors(site="site2")

        assert len(site2_unhealthy) == 1
        assert site2_unhealthy[0].selector == ".failing"
        assert site2_unhealthy[0].site == "site2"

    def test_unhealthy_sorted_by_success_rate(self, tracker):
        """Test that unhealthy selectors are sorted by success rate (ascending)."""
        unhealthy = tracker.get_unhealthy_selectors()

        # Should be sorted: .dead (0%), .failing site2 (30%), then .failing site1 (50%)
        assert unhealthy[0].selector == ".dead"
        assert unhealthy[0].success_rate == 0.0
        assert unhealthy[1].selector == ".failing"
        assert unhealthy[1].site == "site2"
        assert unhealthy[1].success_rate == 0.3
        assert unhealthy[2].selector == ".failing"
        assert unhealthy[2].site == "site1"
        assert unhealthy[2].success_rate == 0.5

    def test_get_site_health(self, tracker):
        """Test getting overall health for a site."""
        health = tracker.get_site_health("site1")

        assert health.site == "site1"
        assert health.total_selectors == 4  # healthy, degraded, failing, dead
        assert health.healthy_selectors == 1
        assert health.degraded_selectors == 1
        assert health.failing_selectors == 2

        # Overall success rate
        total_successes = 9 + 7 + 5 + 0  # 21
        total_attempts = 10 + 10 + 10 + 10  # 40
        expected_rate = total_successes / total_attempts
        assert health.overall_success_rate == expected_rate


class TestPersistence:
    """Tests for JSON persistence functionality."""

    def test_save_and_load(self):
        """Test that data is saved and loaded correctly."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        try:
            # Create tracker and add data
            tracker1 = SelectorHealthTracker(
                history_file=temp_file,
                retention_days=30,
                alert_threshold=0.7,
                min_attempts_for_alert=5,
            )

            tracker1.track_selector_result(".price", "amazon", True, 100.0)
            tracker1.track_selector_result(".price", "amazon", False, 200.0)
            tracker1.register_alternative_selector(".price", "amazon", ".price-alt")

            tracker1.shutdown()

            # Create new tracker pointing to same file
            tracker2 = SelectorHealthTracker(
                history_file=temp_file,
                retention_days=30,
                alert_threshold=0.7,
                min_attempts_for_alert=5,
            )

            # Verify data was loaded
            summary = tracker2.get_selector_summary(".price", "amazon")
            assert summary is not None
            assert summary.total_attempts == 2
            assert summary.success_count == 1
            assert summary.failure_count == 1

            alternatives = tracker2.get_alternative_selectors(".price", "amazon")
            assert ".price-alt" in alternatives

            tracker2.shutdown()

        finally:
            if os.path.exists(temp_file):
                os.unlink(temp_file)

    def test_persistence_format(self):
        """Test the format of the persisted JSON file."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        try:
            tracker = SelectorHealthTracker(
                history_file=temp_file,
                retention_days=30,
                alert_threshold=0.7,
                min_attempts_for_alert=5,
            )

            tracker.track_selector_result(".test", "site", True, 100.0)
            tracker.shutdown()

            # Read and verify JSON structure
            with open(temp_file) as f:
                data = json.load(f)

            assert "records" in data
            assert "summaries" in data
            assert "alternatives" in data
            assert "last_updated" in data
            assert "metadata" in data

            assert data["metadata"]["retention_days"] == 30
            assert data["metadata"]["alert_threshold"] == 0.7
            assert data["metadata"]["version"] == "1.0.0"

        finally:
            if os.path.exists(temp_file):
                os.unlink(temp_file)


class TestCleanup:
    """Tests for 30-day rotation and cleanup."""

    def test_old_records_cleanup(self):
        """Test that records older than retention period are cleaned up."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        try:
            tracker = SelectorHealthTracker(
                history_file=temp_file,
                retention_days=1,  # 1 day for testing
                alert_threshold=0.7,
                min_attempts_for_alert=5,
            )

            # Add some records with current timestamp
            current_time = time.time()
            with tracker._lock:
                tracker._records.append(
                    SelectorHealthRecord(
                        selector=".recent",
                        site="site",
                        timestamp=current_time,
                        success=True,
                        duration_ms=100.0,
                    )
                )
                # Add old record (2 days ago)
                tracker._records.append(
                    SelectorHealthRecord(
                        selector=".old",
                        site="site",
                        timestamp=current_time - (2 * 24 * 60 * 60),  # 2 days ago
                        success=True,
                        duration_ms=100.0,
                    )
                )

            # Run cleanup
            tracker._cleanup_old_records()

            # Verify old record was removed
            with tracker._lock:
                assert len(tracker._records) == 1
                assert tracker._records[0].selector == ".recent"

            tracker.shutdown()

        finally:
            if os.path.exists(temp_file):
                os.unlink(temp_file)


class TestAlternativeSelectors:
    """Tests for alternative selector registration and recommendations."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker for alternative selector tests."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_register_alternative(self, tracker):
        """Test registering alternative selectors."""
        tracker.register_alternative_selector(".price", "amazon", ".price-alt1")
        tracker.register_alternative_selector(".price", "amazon", ".price-alt2")

        alternatives = tracker.get_alternative_selectors(".price", "amazon")
        assert ".price-alt1" in alternatives
        assert ".price-alt2" in alternatives

    def test_alternative_in_summary(self, tracker):
        """Test that alternatives appear in health summary."""
        tracker.register_alternative_selector(".price", "amazon", ".price-alt")
        tracker.track_selector_result(".price", "amazon", True, 100.0)

        summary = tracker.get_selector_summary(".price", "amazon")
        assert ".price-alt" in summary.alternative_selectors

    def test_recommendations_for_failing_selector(self, tracker):
        """Test recommendations for a failing selector."""
        tracker.register_alternative_selector(".price", "amazon", ".price-alt")

        # Make selector fail
        for _ in range(10):
            tracker.track_selector_result(".price", "amazon", False, 5000.0)

        recommendations = tracker.get_recommendations("amazon")
        assert len(recommendations) > 0

        rec = recommendations[0]
        assert rec["selector"] == ".price"
        assert rec["issue"] == "complete_failure"
        assert any("alternative" in s.lower() for s in rec["suggestions"])

    def test_recommendations_for_slow_selector(self, tracker):
        """Test recommendations for a slow selector."""
        # Make selector succeed but be slow
        for _ in range(10):
            tracker.track_selector_result(".price", "amazon", True, 6000.0)

        recommendations = tracker.get_recommendations("amazon")

        # Should suggest timeout increase
        if recommendations:
            rec = recommendations[0]
            assert any("slow" in s.lower() for s in rec["suggestions"])


class TestIntegrationHooks:
    """Tests for integration hooks that will be used by selector_resolver."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker for integration tests."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_get_all_sites(self, tracker):
        """Test getting list of all tracked sites."""
        tracker.track_selector_result(".a", "amazon", True, 100.0)
        tracker.track_selector_result(".b", "ebay", True, 100.0)
        tracker.track_selector_result(".c", "walmart", True, 100.0)

        sites = tracker.get_all_sites()
        assert "amazon" in sites
        assert "ebay" in sites
        assert "walmart" in sites
        assert len(sites) == 3

    def test_export_report(self, tracker):
        """Test exporting a comprehensive health report."""
        tracker.track_selector_result(".price", "amazon", True, 100.0)
        tracker.track_selector_result(".price", "amazon", False, 200.0)
        tracker.track_selector_result(".title", "amazon", True, 150.0)

        report = tracker.export_report("amazon")

        assert report["site"] == "amazon"
        assert report["total_selectors"] == 2
        assert "selectors_by_health" in report
        assert "unhealthy_selectors" in report
        assert "recommendations" in report
        assert "generated_at" in report

    def test_export_all_sites_report(self, tracker):
        """Test exporting report for all sites."""
        tracker.track_selector_result(".price", "amazon", True, 100.0)
        tracker.track_selector_result(".price", "ebay", False, 200.0)

        report = tracker.export_report()

        assert report["site"] == "all"
        assert report["total_selectors"] == 2


class TestSingletonPattern:
    """Tests for the singleton pattern and global instance."""

    def test_get_selector_health_tracker_singleton(self):
        """Test that get_selector_health_tracker returns singleton."""
        # Reset any existing instance
        reset_health_tracker()

        tracker1 = get_selector_health_tracker()
        tracker2 = get_selector_health_tracker()

        assert tracker1 is tracker2

        reset_health_tracker()

    def test_reset_health_tracker(self):
        """Test that reset_health_tracker clears the singleton."""
        # Reset and get fresh instance
        reset_health_tracker()
        tracker1 = get_selector_health_tracker()

        # Reset again
        reset_health_tracker()
        tracker2 = get_selector_health_tracker()

        assert tracker1 is not tracker2

        reset_health_tracker()


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker for edge case tests."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_file = f.name

        tracker = SelectorHealthTracker(
            history_file=temp_file,
            retention_days=30,
            alert_threshold=0.7,
            min_attempts_for_alert=5,
        )

        yield tracker

        tracker.shutdown()
        if os.path.exists(temp_file):
            os.unlink(temp_file)

    def test_get_nonexistent_selector(self, tracker):
        """Test getting summary for selector that doesn't exist."""
        summary = tracker.get_selector_summary(".nonexistent", "site")
        assert summary is None

    def test_empty_tracker_operations(self, tracker):
        """Test operations on empty tracker."""
        assert tracker.get_all_sites() == []
        assert tracker.get_unhealthy_selectors() == []
        assert tracker.get_recommendations() == []

        health = tracker.get_site_health("nonexistent")
        assert health.total_selectors == 0

    def test_very_long_selector_name(self, tracker):
        """Test with very long selector string."""
        long_selector = "." + "a" * 1000
        summary = tracker.track_selector_result(long_selector, "site", True, 100.0)
        assert summary.selector == long_selector

    def test_special_characters_in_selector(self, tracker):
        """Test selectors with special characters."""
        special_selectors = [
            "[data-testid='price']",
            ".price > span:nth-child(2)",
            "//div[@class='price']",
            "text='Buy Now'",
        ]

        for selector in special_selectors:
            summary = tracker.track_selector_result(selector, "site", True, 100.0)
            assert summary.selector == selector

    def test_concurrent_tracking(self, tracker):
        """Test thread safety with concurrent tracking."""
        import concurrent.futures

        def track_results(site):
            for i in range(10):
                tracker.track_selector_result(
                    ".price", site, success=(i % 3 != 0), duration_ms=100.0
                )
            return site

        sites = ["site1", "site2", "site3", "site4", "site5"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            list(executor.map(track_results, sites))

        # Verify all sites have correct counts
        for site in sites:
            summary = tracker.get_selector_summary(".price", site)
            assert summary is not None
            assert summary.total_attempts == 10

    def test_zero_duration(self, tracker):
        """Test tracking with zero duration."""
        summary = tracker.track_selector_result(".test", "site", True, 0.0)
        assert summary.average_duration_ms == 0.0
        assert summary.min_duration_ms == 0.0
        assert summary.max_duration_ms == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
