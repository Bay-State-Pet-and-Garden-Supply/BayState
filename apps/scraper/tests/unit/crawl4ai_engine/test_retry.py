"""Tests for crawl4ai retry logic."""

import pytest
import time

from src.crawl4ai_engine.retry import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitState,
    ErrorCategory,
    ErrorClassification,
    RetryPolicy,
    classify_error,
    retry_with_backoff,
    execute_with_retry,
    ANTI_BOT_KEYWORDS,
    TRANSIENT_KEYWORDS,
    PERMANENT_KEYWORDS,
)


class TestCircuitBreaker:
    """Test suite for CircuitBreaker."""

    @pytest.fixture
    def default_config(self):
        """Default circuit breaker config."""
        return CircuitBreakerConfig(
            failure_threshold=3,
            failure_window_seconds=60.0,
            cooldown_seconds=30.0,
            half_open_max_calls=1,
        )

    @pytest.fixture
    def circuit_breaker(self, default_config):
        """Create a circuit breaker instance."""
        return CircuitBreaker(config=default_config)

    def test_initial_state_closed(self, circuit_breaker):
        """Test circuit breaker starts in closed state."""
        assert circuit_breaker.state == CircuitState.CLOSED
        assert circuit_breaker.can_execute() is True

    def test_record_success_resets_state(self, circuit_breaker):
        """Test recording success resets circuit breaker."""
        # Record some failures
        circuit_breaker.record_failure(ErrorCategory.TRANSIENT)
        circuit_breaker.record_failure(ErrorCategory.TRANSIENT)

        # Record success
        circuit_breaker.record_success()

        assert circuit_breaker.state == CircuitState.CLOSED
        assert len(circuit_breaker.failures) == 0

    def test_record_failure_transient(self, circuit_breaker):
        """Test recording transient failure."""
        circuit_breaker.record_failure(ErrorCategory.TRANSIENT)

        assert circuit_breaker.last_failure_time is not None
        assert len(circuit_breaker.failures) == 1

    def test_record_failure_permanent_no_effect(self, circuit_breaker):
        """Test permanent failures don't count toward threshold."""
        circuit_breaker.record_failure(ErrorCategory.PERMANENT)

        assert len(circuit_breaker.failures) == 0

    def test_circuit_opens_at_threshold(self, default_config):
        """Test circuit opens after threshold failures."""
        cb = CircuitBreaker(config=default_config)

        for _ in range(3):
            cb.record_failure(ErrorCategory.TRANSIENT)

        assert cb.state == CircuitState.OPEN
        assert cb.can_execute() is False

    def test_circuit_half_open_after_cooldown(self, default_config):
        """Test circuit goes half-open after cooldown."""
        cb = CircuitBreaker(config=default_config)

        # Trigger open
        for _ in range(3):
            cb.record_failure(ErrorCategory.TRANSIENT)

        assert cb.state == CircuitState.OPEN

        # Manually set opened_at to past
        cb.opened_at = time.monotonic() - default_config.cooldown_seconds - 1

        assert cb.can_execute() is True
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_success_closes(self, default_config):
        """Test success in half-open closes circuit."""
        cb = CircuitBreaker(config=default_config)

        # Trigger open
        for _ in range(3):
            cb.record_failure(ErrorCategory.TRANSIENT)

        # Move to half-open
        cb.opened_at = time.monotonic() - default_config.cooldown_seconds - 1
        cb.can_execute()  # This triggers half-open

        # Record success
        cb.record_success()

        assert cb.state == CircuitState.CLOSED

    def test_half_open_failure_reopens(self, default_config):
        """Test failure in half-open reopens circuit."""
        cb = CircuitBreaker(config=default_config)

        # Trigger open
        for _ in range(3):
            cb.record_failure(ErrorCategory.TRANSIENT)

        # Move to half-open
        cb.opened_at = time.monotonic() - default_config.cooldown_seconds - 1
        cb.can_execute()  # This triggers half-open

        # Record failure in half-open
        cb.record_failure(ErrorCategory.TRANSIENT)

        assert cb.state == CircuitState.OPEN

    def test_status_returns_dict(self, circuit_breaker):
        """Test status returns expected dictionary."""
        circuit_breaker.record_failure(ErrorCategory.TRANSIENT)

        status = circuit_breaker.status()

        assert "state" in status
        assert "failure_count" in status
        assert "failure_window_seconds" in status
        assert "failure_rate_per_second" in status

    def test_prune_failures(self, default_config):
        """Test old failures are pruned."""
        cb = CircuitBreaker(config=default_config)

        # Add old failure
        cb.failures.append(time.monotonic() - 100)
        cb.failures.append(time.monotonic())

        # Trigger prune
        cb._prune_failures(time.monotonic())

        assert len(cb.failures) == 1


class TestRetryPolicy:
    """Test suite for RetryPolicy."""

    def test_default_values(self):
        """Test default policy values."""
        policy = RetryPolicy()

        assert policy.max_retries == 3
        assert policy.base_delay == 1.0
        assert policy.max_delay == 30.0
        assert policy.jitter_seconds == 1.0
        assert policy.anti_bot_max_retries == 1
        assert policy.anti_bot_base_delay == 30.0
        assert policy.anti_bot_max_delay == 300.0

    def test_custom_values(self):
        """Test custom policy values."""
        policy = RetryPolicy(
            max_retries=5,
            base_delay=2.0,
            max_delay=60.0,
        )

        assert policy.max_retries == 5
        assert policy.base_delay == 2.0
        assert policy.max_delay == 60.0


class TestErrorClassification:
    """Test suite for error classification."""

    def test_error_classification_creation(self):
        """Test creating error classification."""
        classification = ErrorClassification(
            category=ErrorCategory.TRANSIENT,
            retryable=True,
            reason="test reason",
        )

        assert classification.category == ErrorCategory.TRANSIENT
        assert classification.retryable is True
        assert classification.reason == "test reason"

    def test_error_classification_with_failure_type(self):
        """Test classification with failure type."""
        from core.failure_classifier import FailureType

        classification = ErrorClassification(
            category=ErrorCategory.ANTI_BOT,
            retryable=True,
            reason="captcha",
            failure_type=FailureType.CAPTCHA_DETECTED,
        )

        assert classification.failure_type == FailureType.CAPTCHA_DETECTED


class TestClassifyError:
    """Test suite for classify_error function."""

    def test_classify_timeout_error(self):
        """Test classifying timeout errors."""
        error = TimeoutError("Connection timed out")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.TRANSIENT
        assert classification.retryable is True

    def test_classify_rate_limit_error(self):
        """Test classifying rate limit errors."""
        from scrapers.exceptions import RateLimitError

        error = RateLimitError("Too many requests")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.TRANSIENT
        assert classification.retryable is True

    def test_classify_page_not_found(self):
        """Test classifying 404 errors."""
        from scrapers.exceptions import PageNotFoundError

        error = PageNotFoundError("404 not found")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.PERMANENT
        assert classification.retryable is False

    def test_classify_captcha_error(self):
        """Test classifying captcha errors."""
        from scrapers.exceptions import CaptchaError

        error = CaptchaError("Captcha required")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.ANTI_BOT
        assert classification.retryable is True

    def test_classify_access_denied(self):
        """Test classifying access denied errors."""
        from scrapers.exceptions import AccessDeniedError

        error = AccessDeniedError("Access denied")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.ANTI_BOT
        assert classification.retryable is True

    def test_classify_anti_bot_keywords(self):
        """Test classifying anti-bot keyword detection."""
        error = Exception("Page blocked by cloudflare protection")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.ANTI_BOT

    def test_classify_permanent_keywords(self):
        """Test classifying permanent keyword detection."""
        error = Exception("404 page not found")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.PERMANENT

    def test_classify_transient_keywords(self):
        """Test classifying transient keyword detection."""
        error = Exception("Connection reset, please try again")

        classification = classify_error(error)

        assert classification.category == ErrorCategory.TRANSIENT


class TestRetryWithBackoff:
    """Test suite for retry_with_backoff decorator."""

    @pytest.mark.asyncio
    async def test_retry_success_first_attempt(self):
        """Test successful operation on first attempt."""
        call_count = 0

        @retry_with_backoff(max_retries=3)
        async def succeed():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await succeed()
        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retry_with_transient_failure_then_success(self):
        """Test retry after transient failure."""
        call_count = 0

        @retry_with_backoff(max_retries=3, base_delay=0.01)
        async def fail_once():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("Temporary failure")
            return "success"

        result = await fail_once()
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_retry_exhausted_raises(self):
        """Test exhausted retries raises exception."""
        call_count = 0

        class _FixedDelayStrategy:
            def get_adaptive_config(self, failure_type, site_name, current_retry_count=0):
                return {"delay": 0.01}

            def calculate_delay(self, config, retry_count):
                return 0.01

        class _FixedDelayExecutor:
            adaptive_strategy = _FixedDelayStrategy()

        @retry_with_backoff(
            max_retries=2,
            base_delay=0.01,
            jitter_seconds=0.0,
            retry_executor=_FixedDelayExecutor(),
        )
        async def always_fail():
            nonlocal call_count
            call_count += 1
            raise TimeoutError("Persistent failure")

        from scrapers.exceptions import TimeoutError as ScraperTimeoutError

        with pytest.raises(ScraperTimeoutError):
            await always_fail()

        assert call_count == 3  # Initial + 2 retries

    @pytest.mark.asyncio
    async def test_retry_on_retry_callback(self):
        """Test retry callback is called."""
        callback_calls = []

        def on_retry(attempt, exception, delay, classification):
            callback_calls.append((attempt, str(exception), delay))

        @retry_with_backoff(max_retries=2, base_delay=0.01, on_retry=on_retry)
        async def fail_once():
            if len(callback_calls) < 2:
                raise TimeoutError("Fail")
            return "success"

        await fail_once()

        assert len(callback_calls) == 2
        assert callback_calls[0][0] == 1  # First retry attempt

    @pytest.mark.asyncio
    async def test_retry_with_circuit_breaker_open(self):
        """Test circuit breaker blocks execution."""
        from scrapers.exceptions import CircuitBreakerOpenError

        cb = CircuitBreaker()
        # Open the circuit
        for _ in range(5):
            cb.record_failure(ErrorCategory.TRANSIENT)

        @retry_with_backoff(circuit_breaker=cb)
        async def operation():
            return "success"

        with pytest.raises(CircuitBreakerOpenError):
            await operation()


class TestExecuteWithRetry:
    """Test suite for execute_with_retry function."""

    @pytest.mark.asyncio
    async def test_execute_success(self):
        """Test successful execution."""
        result = await execute_with_retry(lambda: "success")
        assert result == "success"

    @pytest.mark.asyncio
    async def test_execute_with_async_success(self):
        """Test async operation execution."""

        async def async_op():
            return "async success"

        result = await execute_with_retry(async_op)
        assert result == "async success"

    @pytest.mark.asyncio
    async def test_execute_retries_on_failure(self):
        """Test retries on failure."""
        call_count = 0

        async def fail_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise TimeoutError("Temp failure")
            return "recovered"

        result = await execute_with_retry(fail_twice, policy=RetryPolicy(max_retries=3, base_delay=0.01))

        assert result == "recovered"
        assert call_count == 3


class TestExponentialBackoff:
    """Test suite for exponential backoff calculation."""

    def test_backoff_multiplier(self):
        """Test exponential backoff multiplier."""
        policy = RetryPolicy(base_delay=1.0, max_delay=30.0)

        # With no jitter, delay should double each attempt
        delays = []
        for attempt in range(5):
            delay = policy.base_delay * (2**attempt)
            if delay > policy.max_delay:
                delay = policy.max_delay
            delays.append(delay)

        assert delays[0] == 1.0
        assert delays[1] == 2.0
        assert delays[2] == 4.0
        assert delays[3] == 8.0
        assert delays[4] == 16.0

    def test_anti_bot_longer_delay(self):
        """Test anti-bot errors get longer delays."""
        policy = RetryPolicy(
            base_delay=1.0,
            max_delay=30.0,
            anti_bot_base_delay=30.0,
            anti_bot_max_delay=300.0,
        )

        # Anti-bot should use much longer base delay
        assert policy.anti_bot_base_delay > policy.base_delay
        assert policy.anti_bot_max_delay > policy.max_delay


class TestErrorCategory:
    """Test suite for ErrorCategory enum."""

    def test_categories_exist(self):
        """Test all expected categories exist."""
        assert ErrorCategory.TRANSIENT.value == "transient"
        assert ErrorCategory.PERMANENT.value == "permanent"
        assert ErrorCategory.ANTI_BOT.value == "anti_bot"


class TestKeywordTuples:
    """Test suite for keyword tuples used in classification."""

    def test_anti_bot_keywords(self):
        """Test anti-bot keywords are defined."""
        assert "captcha" in ANTI_BOT_KEYWORDS
        assert "cloudflare" in ANTI_BOT_KEYWORDS

    def test_transient_keywords(self):
        """Test transient keywords are defined."""
        assert "timeout" in TRANSIENT_KEYWORDS
        assert "rate limit" in TRANSIENT_KEYWORDS

    def test_permanent_keywords(self):
        """Test permanent keywords are defined."""
        assert "404" in PERMANENT_KEYWORDS
        assert "not found" in PERMANENT_KEYWORDS
