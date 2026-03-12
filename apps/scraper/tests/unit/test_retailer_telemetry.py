import logging
import time

from scrapers.ai_discovery.telemetry import RetailerTelemetry


def test_record_and_rate():
    rt = RetailerTelemetry(log_interval=1000)
    rt.record_attempt("example.com", success=False)
    rt.record_attempt("example.com", success=True)
    rt.record_attempt("example.com", success=True)

    stats = rt._stats.get("example.com")
    assert stats is not None
    assert stats.attempts == 3
    assert stats.successes == 2
    assert 0 < stats.last_attempt_time <= time.time()
    assert 0 < stats.last_success_time <= time.time()
    assert abs(stats.success_rate - (2 / 3)) < 0.0001


def test_prioritization_and_unknowns():
    rt = RetailerTelemetry(log_interval=1000)
    # two retailers with different success rates
    rt.record_attempt("a.com", success=False)
    rt.record_attempt("a.com", success=True)
    rt.record_attempt("b.com", success=True)
    rt.record_attempt("b.com", success=True)

    prioritized = rt.get_prioritized_retailers(["a.com", "b.com", "c.com"], limit=3)
    # b.com has 2/2 = 1.0, a.com has 1/2 = 0.5, c.com unseen -> 0.0
    assert prioritized[0] == "b.com"
    assert prioritized[1] == "a.com"
    assert prioritized[2] == "c.com"


def test_log_stats_runs_without_error(caplog):
    caplog.set_level(logging.INFO)
    rt = RetailerTelemetry(log_interval=1)
    # trigger logging by making attempts
    rt.record_attempt("x.com", success=True)
    # Should have logged top retailers
    assert any("Top retailers by success rate" in rec.message or "Top retailers" in rec.message for rec in caplog.records)
