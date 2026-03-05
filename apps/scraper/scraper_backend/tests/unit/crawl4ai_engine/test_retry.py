"""
Tests for Crawl4AI Engine Retry Module.

Tests cover:
- Exponential backoff calculation
- Circuit breaker state transitions
- Error classification
- Retry execution with mocked operations
- Integration with failure classifier
"""

from __future__ import annotations

import asyncio
import threading
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Import the module under test
import sys
from pathlib import Path

# Add project paths for imports
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "scraper_backend" / "src"))
sys.path.insert(0, str(project_root / "core"))

# Import the module under test
from crawl4ai_engine.retry import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerState,
    Crawl4AIFailureType,
    Crawl4AIRetryHandler,
    RetryConfig,
    RetryContext,
    RetryResult,
    classify_crawl4ai_error,
    is_retryable_crawl4ai_error,
    with_crawl4ai_retry,
)
from failure_classifier import FailureType
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from scraper_backend.src.crawl4ai_engine.retry import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerState,
    Crawl4AIFailureType,
    Crawl4AIRetryHandler,
    RetryConfig,
    RetryContext,
    RetryResult,
    classify_crawl4ai_error,
    is_retryable_crawl4ai_error,
    with_crawl4ai_retry,
)
from core.failure_classifier import FailureType


class TestCrawl4AIFailureType:
    """Tests for Crawl4AIFailureType enum."""

    def test_failure_type_values(self):
        """Test that all failure types have unique values."""
        values = [ft.value for ft in Crawl4AIFailureType]
        assert len(values) == len(set(values)), "Failure types must have unique values"

    def test_anti_bot_types_exist(self):
        """Test that anti-bot specific types exist."""
        anti_bot_types = {
            Crawl4AIFailureType.CHALLENGE_DETECTED,
            Crawl4AIFailureType.BROWSER_FINGERPRINT_BLOCKED,
            Crawl4AIFailureType.BEHAVIOR_ANALYSIS_BLOCKED,
        }
        assert all(t in Crawl4AIFailureType for t in anti_bot_types)


class TestCircuitBreakerConfig:
    """Tests for CircuitBreakerConfig dataclass."""

    def test_default_values(self):
        """Test default configuration values."""
        config = CircuitBreakerConfig()
        assert config.failure_threshold == 5
        assert config.success_threshold == 2
        assert config.timeout_seconds == 60.0
        assert config.half_open_max_calls == 3
        assert config.anti_bot_open_duration == 300.0
        assert config.rate_limit_open_duration == 120.0

    def test_custom_values(self):
        """Test custom configuration values."""
        config = CircuitBreakerConfig(
            failure_threshold=3,
            timeout_seconds=30.0,
            anti_bot_open_duration=600.0,
        )
        assert config.failure_threshold == 3
        assert config.timeout_seconds == 30.0
        assert config.anti_bot_open_duration == 600.0


class TestCircuitBreaker:
    """Tests for CircuitBreaker class."""

    def test_initial_state_closed(self):
        """Test that circuit starts in CLOSED state."""
        breaker = CircuitBreaker()
        allowed, retry_after = breaker.check("test.com")
        assert allowed is True
        assert retry_after is None

    def test_record_failure_increments_count(self):
        """Test that recording failure increments failure count."""
        breaker = CircuitBreaker()
        breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        status = breaker.get_status("test.com")
        assert status["failure_count"] == 1
        assert status["state"] == "closed"  # Below threshold

    def test_circuit_opens_after_threshold(self):
        """Test that circuit opens after failure threshold."""
        config = CircuitBreakerConfig(failure_threshold=3)
        breaker = CircuitBreaker(config)

        # Record failures up to threshold
        for _ in range(3):
            breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        status = breaker.get_status("test.com")
        assert status["state"] == "open"

        # Check that requests are blocked
        allowed, retry_after = breaker.check("test.com")
        assert allowed is False
        assert retry_after is not None
        assert retry_after > 0

    def test_circuit_half_open_after_timeout(self):
        """Test that circuit transitions to half-open after timeout."""
        config = CircuitBreakerConfig(
            failure_threshold=1,
            timeout_seconds=0.1,  # Short timeout for testing
        )
        breaker = CircuitBreaker(config)

        # Open the circuit
        breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        # Wait for timeout
        time.sleep(0.15)

        # Should now be half-open
        allowed, _ = breaker.check("test.com")
        assert allowed is True
        assert breaker.get_status("test.com")["state"] == "half_open"

    def test_circuit_closes_after_successes(self):
        """Test that circuit closes after success threshold."""
        config = CircuitBreakerConfig(
            failure_threshold=1,
            success_threshold=2,
            timeout_seconds=0.1,
        )
        breaker = CircuitBreaker(config)

        # Open the circuit
        breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)
        time.sleep(0.15)

        # Move to half-open and record successes
        breaker.check("test.com")  # Transition to half-open
        breaker.record_success("test.com")
        breaker.record_success("test.com")

        status = breaker.get_status("test.com")
        assert status["state"] == "closed"
        assert status["failure_count"] == 0

    def test_half_open_returns_to_open_on_failure(self):
        """Test that half-open circuit returns to open on failure."""
        config = CircuitBreakerConfig(
            failure_threshold=1,
            timeout_seconds=0.1,
        )
        breaker = CircuitBreaker(config)

        # Open then transition to half-open
        breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)
        time.sleep(0.15)
        breaker.check("test.com")

        assert breaker.get_status("test.com")["state"] == "half_open"

        # Failure in half-open returns to open
        breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)
        assert breaker.get_status("test.com")["state"] == "open"

    def test_anti_bot_extended_timeout(self):
        """Test that anti-bot failures get extended timeout."""
        config = CircuitBreakerConfig(
            failure_threshold=2,
            timeout_seconds=60.0,
            anti_bot_open_duration=300.0,
        )
        breaker = CircuitBreaker(config)

        # Record consecutive anti-bot failures
        breaker.record_failure("test.com", Crawl4AIFailureType.CHALLENGE_DETECTED)
        breaker.record_failure("test.com", Crawl4AIFailureType.CHALLENGE_DETECTED)

        # Circuit should be open
        allowed, _ = breaker.check("test.com")
        assert allowed is False

        status = breaker.get_status("test.com")
        assert status["consecutive_anti_bot"] == 2

    def test_reset_circuit(self):
        """Test manual circuit reset."""
        breaker = CircuitBreaker()

        # Open the circuit
        for _ in range(5):
            breaker.record_failure("test.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        assert breaker.get_status("test.com")["state"] == "open"

        # Reset
        breaker.reset("test.com")

        status = breaker.get_status("test.com")
        assert status["state"] == "closed"
        assert status["failure_count"] == 0

    def test_multiple_keys_isolated(self):
        """Test that different keys have isolated states."""
        breaker = CircuitBreaker()

        # Failures on one domain don't affect another
        for _ in range(5):
            breaker.record_failure("site1.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        # site1 should be open
        assert breaker.get_status("site1.com")["state"] == "open"

        # site2 should still be closed
        allowed, _ = breaker.check("site2.com")
        assert allowed is True
        assert breaker.get_status("site2.com")["state"] == "closed"


class TestRetryConfig:
    """Tests for RetryConfig dataclass."""

    def test_default_values(self):
        """Test default retry configuration."""
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.base_delay == 1.0
        assert config.max_delay == 60.0
        assert config.exponential_base == 2.0
        assert config.enable_jitter is True
        assert config.jitter_factor == 0.1

    def test_custom_values(self):
        """Test custom retry configuration."""
        config = RetryConfig(
            max_retries=5,
            base_delay=2.0,
            exponential_base=3.0,
            enable_jitter=False,
        )
        assert config.max_retries == 5
        assert config.base_delay == 2.0
        assert config.exponential_base == 3.0
        assert config.enable_jitter is False


class TestErrorClassification:
    """Tests for error classification functions."""

    def test_classify_browser_init_error(self):
        """Test classification of browser initialization errors."""
        exc = Exception("Browser initialization timeout")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.BROWSER_TIMEOUT
        assert base_type == FailureType.TIMEOUT

    def test_classify_browser_crash(self):
        """Test classification of browser crash errors."""
        exc = Exception("Browser crashed and disconnected")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.BROWSER_CRASHED
        assert base_type == FailureType.NETWORK_ERROR

    def test_classify_anti_bot_challenge(self):
        """Test classification of anti-bot challenge detection."""
        exc = Exception("CF-Challenge detected: please wait")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.CHALLENGE_DETECTED
        assert base_type == FailureType.CAPTCHA_DETECTED

    def test_classify_fingerprint_blocked(self):
        """Test classification of fingerprint blocking."""
        exc = Exception("Browser fingerprint check failed")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.BROWSER_FINGERPRINT_BLOCKED
        assert base_type == FailureType.ACCESS_DENIED

    def test_classify_rate_limit(self):
        """Test classification of rate limit errors."""
        exc = Exception("Rate limit exceeded: 429 Too Many Requests")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.CONNECTION_RESET
        assert base_type == FailureType.RATE_LIMITED

    def test_classify_ssl_error(self):
        """Test classification of SSL errors."""
        exc = Exception("SSL certificate validation failed")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.SSL_ERROR
        assert base_type == FailureType.NETWORK_ERROR

    def test_classify_redirect_loop(self):
        """Test classification of redirect loops."""
        exc = Exception("Navigation error: too many redirects")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.REDIRECT_LOOP
        assert base_type == FailureType.NETWORK_ERROR

    def test_classify_js_timeout(self):
        """Test classification of JavaScript execution timeout."""
        exc = Exception("JavaScript execution timeout")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.JS_TIMEOUT
        assert base_type == FailureType.TIMEOUT

    def test_classify_memory_exhausted(self):
        """Test classification of memory errors."""
        exc = Exception("Out of memory: browser process killed")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.MEMORY_EXHAUSTED
        assert base_type == FailureType.NETWORK_ERROR

    def test_classify_extraction_error(self):
        """Test classification of content extraction errors."""
        exc = Exception("Schema validation failed for extracted data")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR
        assert base_type == FailureType.ELEMENT_MISSING

    def test_default_classification(self):
        """Test default classification for unknown errors."""
        exc = Exception("Some random error")
        crawl_type, base_type = classify_crawl4ai_error(exc)
        assert crawl_type == Crawl4AIFailureType.NAVIGATION_ERROR
        assert base_type == FailureType.NETWORK_ERROR


class TestIsRetryable:
    """Tests for is_retryable_crawl4ai_error function."""

    def test_retryable_errors(self):
        """Test that transient errors are retryable."""
        retryable = [
            Crawl4AIFailureType.BROWSER_TIMEOUT,
            Crawl4AIFailureType.BROWSER_CRASHED,
            Crawl4AIFailureType.CONNECTION_RESET,
            Crawl4AIFailureType.CHALLENGE_DETECTED,
            Crawl4AIFailureType.NAVIGATION_ERROR,
            Crawl4AIFailureType.JS_TIMEOUT,
        ]
        for failure_type in retryable:
            assert is_retryable_crawl4ai_error(failure_type) is True, f"{failure_type.name} should be retryable"

    def test_non_retryable_errors(self):
        """Test that permanent errors are not retryable."""
        non_retryable = [
            Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR,
            Crawl4AIFailureType.CONTENT_PARSE_ERROR,
            Crawl4AIFailureType.SSL_ERROR,
        ]
        for failure_type in non_retryable:
            assert is_retryable_crawl4ai_error(failure_type) is False, f"{failure_type.name} should not be retryable"


class TestCrawl4AIRetryHandler:
    """Tests for Crawl4AIRetryHandler class."""

    @pytest.mark.asyncio
    async def test_successful_operation(self):
        """Test that successful operations return immediately."""
        handler = Crawl4AIRetryHandler()

        async def success_op():
            return "success"

        result = await handler.execute(success_op, "https://example.com")

        assert result.success is True
        assert result.result == "success"
        assert result.attempts == 1
        assert result.total_delay == 0.0

    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        """Test that failures trigger retry with exponential backoff."""
        config = RetryConfig(
            max_retries=2,
            base_delay=0.01,  # Short delay for testing
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        call_count = 0

        async def fail_twice_then_succeed():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Temporary failure")
            return "success"

        result = await handler.execute(fail_twice_then_succeed, "https://example.com")

        assert result.success is True
        assert result.attempts == 3
        assert call_count == 3
        assert result.total_delay > 0  # Should have some delay

    @pytest.mark.asyncio
    async def test_max_retries_exceeded(self):
        """Test that max retries exceeded returns failure."""
        config = RetryConfig(
            max_retries=2,
            base_delay=0.01,
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        async def always_fail():
            raise Exception("Persistent failure")

        result = await handler.execute(always_fail, "https://example.com")

        assert result.success is False
        assert result.attempts == 3  # Initial + 2 retries
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_non_retryable_error(self):
        """Test that non-retryable errors fail immediately."""
        handler = Crawl4AIRetryHandler()

        async def schema_error():
            raise Exception("Schema validation failed for extracted data")

        result = await handler.execute(schema_error, "https://example.com")

        assert result.success is False
        assert result.attempts == 1  # No retries
        assert result.failure_type == Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR

    @pytest.mark.asyncio
    async def test_circuit_breaker_blocks(self):
        """Test that circuit breaker blocks requests when open."""
        breaker = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1))
        handler = Crawl4AIRetryHandler(circuit_breaker=breaker)

        # Open the circuit
        breaker.record_failure("example.com", Crawl4AIFailureType.NAVIGATION_ERROR)

        async def should_not_run():
            raise Exception("Should not be called")

        result = await handler.execute(should_not_run, "https://example.com")

        assert result.success is False
        assert result.circuit_open is True
        assert result.attempts == 0

    @pytest.mark.asyncio
    async def test_cancellation(self):
        """Test that stop_event cancels retry loop."""
        config = RetryConfig(max_retries=5, base_delay=1.0)
        handler = Crawl4AIRetryHandler(retry_config=config)

        stop_event = threading.Event()

        async def slow_fail():
            stop_event.set()  # Signal cancellation on first call
            raise Exception("Failing")

        result = await handler.execute(
            slow_fail,
            "https://example.com",
            stop_event=stop_event,
        )

        assert result.cancelled is True
        assert result.success is False

    @pytest.mark.asyncio
    async def test_on_retry_callback(self):
        """Test that on_retry callback is invoked."""
        config = RetryConfig(max_retries=1, base_delay=0.01, enable_jitter=False)
        handler = Crawl4AIRetryHandler(retry_config=config)

        callback_calls = []

        def on_retry(attempt, error, delay):
            callback_calls.append((attempt, str(error), delay))

        async def fail_once():
            if len(callback_calls) == 0:
                raise Exception("First attempt fails")
            return "success"

        await handler.execute(
            fail_once,
            "https://example.com",
            on_retry=on_retry,
        )

        assert len(callback_calls) == 1
        assert callback_calls[0][0] == 0  # First attempt
        assert callback_calls[0][2] > 0  # Delay > 0

    @pytest.mark.asyncio
    async def test_recovery_handler(self):
        """Test that recovery handlers are invoked."""
        config = RetryConfig(
            max_retries=2,
            base_delay=0.01,
            anti_bot_base_delay=0.05,  # Short delay for testing
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        recovery_called = False

        def recovery_handler():
            nonlocal recovery_called
            recovery_called = True
            return True  # Recovery successful
        async def challenge_error():
            raise Exception("CF-Challenge detected")

        result = await handler.execute(challenge_error, "https://example.com")

        assert recovery_called is True

    def test_delay_calculation_anti_bot(self):
        """Test that anti-bot failures get longer delays."""
        config = RetryConfig(
            anti_bot_base_delay=30.0,
            network_error_base_delay=1.0,
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        anti_bot_delay = handler._calculate_delay(
            Crawl4AIFailureType.CHALLENGE_DETECTED,
            0,
        )
        network_delay = handler._calculate_delay(
            Crawl4AIFailureType.NAVIGATION_ERROR,
            0,
        )

        assert anti_bot_delay >= 30.0
        assert network_delay >= 1.0
        assert anti_bot_delay > network_delay

    def test_delay_calculation_exponential(self):
        """Test exponential backoff calculation."""
        config = RetryConfig(
            base_delay=1.0,
            exponential_base=2.0,
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        delay_0 = handler._calculate_delay(Crawl4AIFailureType.NAVIGATION_ERROR, 0)
        delay_1 = handler._calculate_delay(Crawl4AIFailureType.NAVIGATION_ERROR, 1)
        delay_2 = handler._calculate_delay(Crawl4AIFailureType.NAVIGATION_ERROR, 2)

        assert delay_0 == 1.0
        assert delay_1 == 2.0
        assert delay_2 == 4.0

    def test_delay_max_cap(self):
        """Test that delay is capped at max_delay."""
        config = RetryConfig(
            base_delay=10.0,
            exponential_base=10.0,
            max_delay=50.0,
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        # 10 * 10^2 = 1000, should be capped at 50
        delay = handler._calculate_delay(Crawl4AIFailureType.NAVIGATION_ERROR, 2)

        assert delay == 50.0

    def test_extract_domain(self):
        """Test domain extraction from URLs."""
        handler = Crawl4AIRetryHandler()

        assert handler._extract_domain("https://example.com/path") == "example.com"
        assert handler._extract_domain("http://sub.example.com:8080/path") == "sub.example.com:8080"
        assert handler._extract_domain("invalid-url") == "invalid-url"


class TestRetryDecorator:
    """Tests for the with_crawl4ai_retry decorator."""

    @pytest.mark.asyncio
    async def test_decorator_success(self):
        """Test that decorator works with successful functions."""

        @with_crawl4ai_retry(max_retries=2)
        async def fetch_data(url: str):
            return f"data from {url}"

        result = await fetch_data("https://example.com")
        assert result == "data from https://example.com"

    @pytest.mark.asyncio
    async def test_decorator_retry(self):
        """Test that decorator retries on failure."""
        call_count = 0

        @with_crawl4ai_retry(max_retries=2, base_delay=0.01)
        async def unreliable_fetch(url: str):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise Exception("Temporary error")
            return f"data from {url}"

        result = await unreliable_fetch("https://example.com")
        assert result == "data from https://example.com"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_decorator_max_retries_exceeded(self):
        """Test that decorator raises after max retries."""

        @with_crawl4ai_retry(max_retries=1, base_delay=0.01)
        async def always_fails(url: str):
            raise Exception("Persistent error")

        with pytest.raises(Exception, match="Persistent error"):
            await always_fails("https://example.com")


class TestRetryContext:
    """Tests for RetryContext dataclass."""

    def test_context_creation(self):
        """Test RetryContext creation and dict conversion."""
        context = RetryContext(
            url="https://example.com",
            operation="crawl",
            retry_count=2,
            total_delay=5.0,
            metadata={"key": "value"},
        )

        d = context.to_dict()
        assert d["url"] == "https://example.com"
        assert d["operation"] == "crawl"
        assert d["retry_count"] == 2
        assert d["total_delay"] == 5.0
        assert d["key"] == "value"

    def test_context_with_failure_types(self):
        """Test RetryContext with failure types."""
        context = RetryContext(url="https://example.com")
        context.failure_type = Crawl4AIFailureType.CHALLENGE_DETECTED
        context.base_failure_type = FailureType.CAPTCHA_DETECTED

        d = context.to_dict()
        assert d["failure_type"] == "CHALLENGE_DETECTED"
        assert d["base_failure_type"] == "captcha_detected"


class TestRetryResult:
    """Tests for RetryResult dataclass."""

    def test_result_creation(self):
        """Test RetryResult creation and dict conversion."""
        result = RetryResult(
            success=True,
            result="data",
            attempts=2,
            total_delay=3.0,
        )

        d = result.to_dict()
        assert d["success"] is True
        assert d["attempts"] == 2
        assert d["total_delay"] == 3.0
        assert d["circuit_open"] is False
        assert d["cancelled"] is False

    def test_result_with_failure_types(self):
        """Test RetryResult with failure types."""
        result = RetryResult(
            success=False,
            failure_type=Crawl4AIFailureType.BROWSER_CRASHED,
            base_failure_type=FailureType.NETWORK_ERROR,
        )

        d = result.to_dict()
        assert d["failure_type"] == "BROWSER_CRASHED"
        assert d["base_failure_type"] == "network_error"


class TestIntegrationWithFailureClassifier:
    """Tests for integration with core.failure_classifier."""

    def test_classification_maps_to_base_types(self):
        """Test that all crawl4ai types map to valid base failure types."""
        test_exceptions = [
            (Exception("CF-Challenge"), FailureType.CAPTCHA_DETECTED),
            (Exception("rate limit"), FailureType.RATE_LIMITED),
            (Exception("timeout"), FailureType.TIMEOUT),
            (Exception("element not found"), FailureType.NETWORK_ERROR),
        ]

        for exc, expected_base in test_exceptions:
            _, base_type = classify_crawl4ai_error(exc)
            assert isinstance(base_type, FailureType)

    def test_failure_context_integration(self):
        """Test that FailureContext can be created from retry context."""
        retry_ctx = RetryContext(
            url="https://example.com",
            operation="crawl",
            failure_type=Crawl4AIFailureType.CHALLENGE_DETECTED,
            base_failure_type=FailureType.CAPTCHA_DETECTED,
        )

        failure_ctx = FailureContext(
            failure_type=retry_ctx.base_failure_type or FailureType.NETWORK_ERROR,
            confidence=0.8,
            details=retry_ctx.to_dict(),
            recovery_strategy="retry_with_backoff",
        )

        assert failure_ctx.failure_type == FailureType.CAPTCHA_DETECTED
        assert failure_ctx.confidence == 0.8
        assert "url" in failure_ctx.details


# End-to-end scenario test
class TestEndToEndScenarios:
    """End-to-end scenario tests."""

    @pytest.mark.asyncio
    async def test_scenario_transient_failure_recovery(self):
        """
        Scenario: Transient network failure with eventual success.

        Simulates: Crawl4AI encounters connection reset, retries with
        exponential backoff, then succeeds.
        """
        config = RetryConfig(
            max_retries=3,
            base_delay=0.01,
            enable_jitter=False,
        )
        handler = Crawl4AIRetryHandler(retry_config=config)

        attempt = 0

        async def flaky_crawl():
            nonlocal attempt
            attempt += 1
            if attempt == 1:
                raise Exception("Connection reset by peer")
            if attempt == 2:
                raise Exception("Connection reset by peer")
            return {"content": "success"}

        result = await handler.execute(flaky_crawl, "https://example.com")

        assert result.success is True
        assert result.attempts == 3
        assert result.result == {"content": "success"}
        assert result.total_delay > 0

    @pytest.mark.asyncio
    async def test_scenario_anti_bot_escalation(self):
        """
        Scenario: Anti-bot detection with extended circuit breaker timeout.

        Simulates: Multiple anti-bot challenges open circuit with extended
        timeout to prevent hammering the site.
        """
        config = CircuitBreakerConfig(
            failure_threshold=2,
            anti_bot_open_duration=300.0,
        )
        breaker = CircuitBreaker(config)
        handler = Crawl4AIRetryHandler(circuit_breaker=breaker)

        # First anti-bot detection
        async def challenge_1():
            raise Exception("CF-Challenge detected")

        result1 = await handler.execute(challenge_1, "https://example.com")
        assert result1.success is False
        assert result1.failure_type == Crawl4AIFailureType.CHALLENGE_DETECTED

        # Second anti-bot detection opens circuit
        async def challenge_2():
            raise Exception("CF-Challenge detected")

        result2 = await handler.execute(challenge_2, "https://example.com")
        assert result2.success is False

        # Circuit should now be open
        status = breaker.get_status("example.com")
        assert status["state"] == "open"
        assert status["consecutive_anti_bot"] == 2

        # Third request should be blocked by circuit breaker
        async def should_not_run():
            raise Exception("Should not run")

        result3 = await handler.execute(should_not_run, "https://example.com")
        assert result3.circuit_open is True
        assert result3.attempts == 0

    @pytest.mark.asyncio
    async def test_scenario_non_retryable_immediate_fail(self):
        """
        Scenario: Non-retryable error fails immediately without delay.

        Simulates: Schema validation error indicates configuration issue,
        no amount of retrying will help.
        """
        handler = Crawl4AIRetryHandler()

        async def schema_error():
            raise Exception("Schema validation failed: missing required field")

        start = time.time()
        result = await handler.execute(schema_error, "https://example.com")
        elapsed = time.time() - start

        assert result.success is False
        assert result.attempts == 1  # No retries
        assert result.total_delay == 0.0
        assert elapsed < 0.1  # Should fail fast
        assert result.failure_type == Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
