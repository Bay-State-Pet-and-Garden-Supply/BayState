"""
Crawl4AI Engine Retry Module

Provides intelligent retry logic with exponential backoff, circuit breaker pattern,
and crawl4ai-specific error classification. Integrates with the existing failure
classifier system for comprehensive error handling.

This module extends the core retry infrastructure with specialized handling for
crawl4ai-specific errors including:
- Browser initialization failures
- Page navigation timeouts
- Anti-bot detection responses
- JavaScript execution errors
- Memory/resource exhaustion
"""

from __future__ import annotations

import asyncio
import logging
import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, TypeVar

from core.failure_classifier import FailureClassifier, FailureContext, FailureType

logger = logging.getLogger(__name__)

T = TypeVar("T")


class Crawl4AIFailureType(Enum):
    """
    Extended failure types specific to Crawl4AI operations.

    These complement the base FailureType enum with crawl4ai-specific
    error conditions that require specialized handling.
    """

    # Browser lifecycle errors
    BROWSER_INIT_FAILED = auto()
    BROWSER_CRASHED = auto()
    BROWSER_TIMEOUT = auto()

    # Page navigation errors
    NAVIGATION_ERROR = auto()
    REDIRECT_LOOP = auto()
    SSL_ERROR = auto()
    DNS_RESOLUTION_ERROR = auto()

    # JavaScript execution errors
    JS_EXECUTION_ERROR = auto()
    JS_TIMEOUT = auto()
    DOM_NOT_READY = auto()

    # Anti-bot detection (crawl4ai-specific patterns)
    CHALLENGE_DETECTED = auto()
    BROWSER_FINGERPRINT_BLOCKED = auto()
    BEHAVIOR_ANALYSIS_BLOCKED = auto()

    # Resource errors
    MEMORY_EXHAUSTED = auto()
    RENDER_TIMEOUT = auto()
    DOWNLOAD_TIMEOUT = auto()

    # Content extraction errors
    EXTRACTION_FAILED = auto()
    SCHEMA_VALIDATION_ERROR = auto()
    CONTENT_PARSE_ERROR = auto()

    # Transient network errors
    CONNECTION_RESET = auto()
    CONNECTION_REFUSED = auto()
    PROXY_ERROR = auto()


class CircuitBreakerState(Enum):
    """States for the circuit breaker pattern."""

    CLOSED = "closed"  # Normal operation, requests allowed
    OPEN = "open"  # Failures exceeded threshold, fast-fail
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""

    failure_threshold: int = 5
    """Number of consecutive failures before opening circuit."""

    success_threshold: int = 2
    """Number of consecutive successes to close circuit from half-open."""

    timeout_seconds: float = 60.0
    """Time before transitioning from OPEN to HALF_OPEN."""

    half_open_max_calls: int = 3
    """Maximum concurrent calls allowed in HALF_OPEN state."""

    # Crawl4AI-specific timeouts
    anti_bot_open_duration: float = 300.0
    """Extended timeout for anti-bot blocks (5 minutes)."""

    rate_limit_open_duration: float = 120.0
    """Extended timeout for rate limit scenarios (2 minutes)."""


@dataclass
class _CircuitState:
    """Internal circuit breaker state tracking."""

    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: float | None = None
    last_failure_type: Crawl4AIFailureType | None = None
    half_open_calls: int = 0
    consecutive_anti_bot: int = 0
    consecutive_rate_limits: int = 0


@dataclass
class RetryConfig:
    """Configuration for retry behavior with exponential backoff."""

    max_retries: int = 3
    """Maximum number of retry attempts."""

    base_delay: float = 1.0
    """Initial delay in seconds before first retry."""

    max_delay: float = 60.0
    """Maximum delay cap in seconds."""

    exponential_base: float = 2.0
    """Base for exponential backoff calculation (delay * base^attempt)."""

    enable_jitter: bool = True
    """Add random jitter to prevent thundering herd."""

    jitter_factor: float = 0.1
    """Jitter as fraction of delay (0.1 = 10% variance)."""

    # Failure-type specific delays
    anti_bot_base_delay: float = 30.0
    """Base delay for anti-bot detection scenarios."""

    rate_limit_base_delay: float = 5.0
    """Base delay for rate limit scenarios."""

    network_error_base_delay: float = 1.0
    """Base delay for transient network errors."""

    browser_restart_delay: float = 10.0
    """Delay before retrying after browser crash."""


@dataclass
class RetryContext:
    """Context for retry operations."""

    url: str
    operation: str = "crawl"
    retry_count: int = 0
    total_delay: float = 0.0
    failure_type: Crawl4AIFailureType | None = None
    base_failure_type: FailureType | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging/serialization."""
        return {
            "url": self.url,
            "operation": self.operation,
            "retry_count": self.retry_count,
            "total_delay": self.total_delay,
            "failure_type": self.failure_type.name if self.failure_type else None,
            "base_failure_type": self.base_failure_type.value if self.base_failure_type else None,
            **self.metadata,
        }


@dataclass
class RetryResult:
    """Result of a retry operation."""

    success: bool
    result: Any = None
    error: Exception | None = None
    attempts: int = 0
    total_delay: float = 0.0
    failure_type: Crawl4AIFailureType | None = None
    base_failure_type: FailureType | None = None
    circuit_open: bool = False
    cancelled: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "success": self.success,
            "attempts": self.attempts,
            "total_delay": self.total_delay,
            "failure_type": self.failure_type.name if self.failure_type else None,
            "base_failure_type": self.base_failure_type.value if self.base_failure_type else None,
            "circuit_open": self.circuit_open,
            "cancelled": self.cancelled,
            "error": str(self.error) if self.error else None,
        }


class CircuitBreaker:
    """
    Circuit breaker implementation for Crawl4AI operations.

    Prevents cascading failures by temporarily blocking requests after
    consecutive failures. Implements standard CLOSED -> OPEN -> HALF_OPEN
    state transitions with crawl4ai-specific timeout adjustments.

    Example:
        >>> breaker = CircuitBreaker()
        >>> if breaker.check("example.com"):
        ...     try:
        ...         result = await crawl(url)
        ...         breaker.record_success("example.com")
        ...     except Exception as e:
        ...         failure_type = classify_crawl4ai_error(e)
        ...         breaker.record_failure("example.com", failure_type)
    """

    def __init__(self, config: CircuitBreakerConfig | None = None) -> None:
        """Initialize circuit breaker with optional configuration."""
        self.config = config or CircuitBreakerConfig()
        self._states: dict[str, _CircuitState] = {}
        self._lock = threading.RLock()

    def _get_state(self, key: str) -> _CircuitState:
        """Get or create circuit state for a key."""
        with self._lock:
            if key not in self._states:
                self._states[key] = _CircuitState()
            return self._states[key]

    def check(self, key: str) -> tuple[bool, float | None]:
        """
        Check if operation should be allowed.

        Args:
            key: Circuit identifier (typically the domain or URL)

        Returns:
            Tuple of (allowed, retry_after_seconds).
            If allowed is False, retry_after indicates when to retry.
        """
        with self._lock:
            state = self._get_state(key)

            if state.state == CircuitBreakerState.CLOSED:
                return True, None

            if state.state == CircuitBreakerState.OPEN:
                elapsed = time.time() - (state.last_failure_time or 0)

                # Determine timeout based on failure pattern
                timeout = self.config.timeout_seconds
                if state.consecutive_anti_bot >= 2:
                    timeout = self.config.anti_bot_open_duration
                elif state.consecutive_rate_limits >= 2:
                    timeout = self.config.rate_limit_open_duration

                if elapsed >= timeout:
                    logger.info(f"Circuit breaker [{key}] transitioning to HALF_OPEN")
                    state.state = CircuitBreakerState.HALF_OPEN
                    state.half_open_calls = 0
                    return True, None

                retry_after = timeout - elapsed
                return False, retry_after

            if state.state == CircuitBreakerState.HALF_OPEN:
                if state.half_open_calls < self.config.half_open_max_calls:
                    state.half_open_calls += 1
                    return True, None
                return False, self.config.timeout_seconds / 2

            return True, None

    def record_success(self, key: str) -> None:
        """Record successful operation."""
        with self._lock:
            state = self._get_state(key)

            if state.state == CircuitBreakerState.HALF_OPEN:
                state.success_count += 1
                if state.success_count >= self.config.success_threshold:
                    logger.info(f"Circuit breaker [{key}] CLOSED after recovery")
                    state.state = CircuitBreakerState.CLOSED
                    state.failure_count = 0
                    state.success_count = 0
                    state.consecutive_anti_bot = 0
                    state.consecutive_rate_limits = 0

            elif state.state == CircuitBreakerState.CLOSED:
                # Decrement failure count on success
                state.failure_count = max(0, state.failure_count - 1)
                state.consecutive_anti_bot = max(0, state.consecutive_anti_bot - 1)
                state.consecutive_rate_limits = max(0, state.consecutive_rate_limits - 1)

    def record_failure(
        self,
        key: str,
        failure_type: Crawl4AIFailureType,
    ) -> None:
        """Record failed operation."""
        with self._lock:
            state = self._get_state(key)
            state.failure_count += 1
            state.last_failure_time = time.time()
            state.last_failure_type = failure_type

            # Track consecutive special failure types
            if failure_type in (
                Crawl4AIFailureType.CHALLENGE_DETECTED,
                Crawl4AIFailureType.BROWSER_FINGERPRINT_BLOCKED,
                Crawl4AIFailureType.BEHAVIOR_ANALYSIS_BLOCKED,
            ):
                state.consecutive_anti_bot += 1
            else:
                state.consecutive_anti_bot = max(0, state.consecutive_anti_bot - 1)

            if failure_type == Crawl4AIFailureType.CONNECTION_RESET:
                state.consecutive_rate_limits += 1
            else:
                state.consecutive_rate_limits = max(0, state.consecutive_rate_limits - 1)

            if state.state == CircuitBreakerState.HALF_OPEN:
                logger.warning(f"Circuit breaker [{key}] returning to OPEN")
                state.state = CircuitBreakerState.OPEN
                state.success_count = 0
                state.half_open_calls = 0

            elif state.state == CircuitBreakerState.CLOSED:
                # Adjust threshold for anti-bot scenarios
                threshold = self.config.failure_threshold
                if state.consecutive_anti_bot >= 2:
                    threshold = max(2, threshold - 2)

                if state.failure_count >= threshold:
                    logger.warning(f"Circuit breaker [{key}] OPEN after {state.failure_count} failures")
                    state.state = CircuitBreakerState.OPEN

    def get_status(self, key: str) -> dict[str, Any]:
        """Get circuit breaker status for a key."""
        with self._lock:
            state = self._get_state(key)
            return {
                "key": key,
                "state": state.state.value,
                "failure_count": state.failure_count,
                "success_count": state.success_count,
                "consecutive_anti_bot": state.consecutive_anti_bot,
                "consecutive_rate_limits": state.consecutive_rate_limits,
                "last_failure_time": state.last_failure_time,
                "last_failure_type": (state.last_failure_type.name if state.last_failure_type else None),
            }

    def reset(self, key: str) -> None:
        """Manually reset circuit breaker for a key."""
        with self._lock:
            if key in self._states:
                self._states[key] = _CircuitState()
                logger.info(f"Circuit breaker [{key}] manually reset")


def classify_crawl4ai_error(
    exc: Exception,
    context: RetryContext | None = None,
) -> tuple[Crawl4AIFailureType, FailureType]:
    """
    Classify a Crawl4AI exception into specific failure types.

    Maps crawl4ai-specific errors to both Crawl4AIFailureType (for detailed
    retry handling) and base FailureType (for integration with existing
    failure classifier).

    Args:
        exc: The exception from Crawl4AI
        context: Optional retry context for additional classification hints

    Returns:
        Tuple of (Crawl4AIFailureType, FailureType) for detailed and base classification
    """
    exc_str = str(exc).lower()
    exc_type = type(exc).__name__

    # Browser initialization errors
    if "browser" in exc_str and any(term in exc_str for term in ["init", "launch", "start", "spawn"]):
        if "timeout" in exc_str:
            return Crawl4AIFailureType.BROWSER_TIMEOUT, FailureType.TIMEOUT
        return Crawl4AIFailureType.BROWSER_INIT_FAILED, FailureType.NETWORK_ERROR

    if "browser" in exc_str and any(term in exc_str for term in ["crash", "disconnected"]):
        return Crawl4AIFailureType.BROWSER_CRASHED, FailureType.NETWORK_ERROR

    # Anti-bot detection patterns (crawl4ai-specific)
    anti_bot_patterns = [
        "challenge",
        "cf-challenge",
        "turnstile",
        "datadome",
        "perimeterx",
        "px-captcha",
        "imperva",
        "incapsula",
        "fingerprint",
        "bot detected",
        "automation detected",
        "suspicious activity",
        "unusual traffic",
    ]
    if any(pattern in exc_str for pattern in anti_bot_patterns):
        if "fingerprint" in exc_str or "browser check" in exc_str:
            return (
                Crawl4AIFailureType.BROWSER_FINGERPRINT_BLOCKED,
                FailureType.ACCESS_DENIED,
            )
        if "behavior" in exc_str or "interaction" in exc_str:
            return (
                Crawl4AIFailureType.BEHAVIOR_ANALYSIS_BLOCKED,
                FailureType.ACCESS_DENIED,
            )
        return Crawl4AIFailureType.CHALLENGE_DETECTED, FailureType.CAPTCHA_DETECTED

    # Rate limiting
    if any(term in exc_str for term in ["rate limit", "too many requests", "429"]):
        return Crawl4AIFailureType.CONNECTION_RESET, FailureType.RATE_LIMITED

    # SSL/TLS errors (check before navigation as these can occur independently)
    if "ssl" in exc_str or "certificate" in exc_str or "tls" in exc_str:
        return Crawl4AIFailureType.SSL_ERROR, FailureType.NETWORK_ERROR

    # Navigation errors
    if any(term in exc_str for term in ["navigation", "goto", "navigate"]):
        if "redirect" in exc_str or "too many redirects" in exc_str:
            return Crawl4AIFailureType.REDIRECT_LOOP, FailureType.NETWORK_ERROR
        if "dns" in exc_str or "name resolution" in exc_str:
            return Crawl4AIFailureType.DNS_RESOLUTION_ERROR, FailureType.NETWORK_ERROR
        return Crawl4AIFailureType.NAVIGATION_ERROR, FailureType.NETWORK_ERROR

    # JavaScript execution errors
    if any(term in exc_str for term in ["javascript", "js execution", "eval"]):
        if "timeout" in exc_str:
            return Crawl4AIFailureType.JS_TIMEOUT, FailureType.TIMEOUT
        return Crawl4AIFailureType.JS_EXECUTION_ERROR, FailureType.NETWORK_ERROR

    if "dom" in exc_str or "document" in exc_str:
        if "ready" in exc_str or "loaded" in exc_str:
            return Crawl4AIFailureType.DOM_NOT_READY, FailureType.TIMEOUT

    # Resource/memory errors
    if any(term in exc_str for term in ["memory", "oom", "out of memory"]):
        return Crawl4AIFailureType.MEMORY_EXHAUSTED, FailureType.NETWORK_ERROR

    if "render" in exc_str and "timeout" in exc_str:
        return Crawl4AIFailureType.RENDER_TIMEOUT, FailureType.TIMEOUT

    if "download" in exc_str and "timeout" in exc_str:
        return Crawl4AIFailureType.DOWNLOAD_TIMEOUT, FailureType.TIMEOUT

    # Content extraction errors
    if any(term in exc_str for term in ["extraction", "extract", "schema"]):
        if "validation" in exc_str or "schema" in exc_str:
            return Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR, FailureType.ELEMENT_MISSING
        if "parse" in exc_str:
            return Crawl4AIFailureType.CONTENT_PARSE_ERROR, FailureType.ELEMENT_MISSING
        return Crawl4AIFailureType.EXTRACTION_FAILED, FailureType.ELEMENT_MISSING

    # Connection errors
    if "connection" in exc_str:
        if "reset" in exc_str or "aborted" in exc_str:
            return Crawl4AIFailureType.CONNECTION_RESET, FailureType.NETWORK_ERROR
        if "refused" in exc_str:
            return Crawl4AIFailureType.CONNECTION_REFUSED, FailureType.NETWORK_ERROR

    if "proxy" in exc_str:
        return Crawl4AIFailureType.PROXY_ERROR, FailureType.NETWORK_ERROR

    # Timeout fallbacks
    if "timeout" in exc_str or "timed out" in exc_str:
        return Crawl4AIFailureType.BROWSER_TIMEOUT, FailureType.TIMEOUT

    # Default to network error
    return Crawl4AIFailureType.NAVIGATION_ERROR, FailureType.NETWORK_ERROR


def is_retryable_crawl4ai_error(failure_type: Crawl4AIFailureType) -> bool:
    """
    Determine if a Crawl4AI error type is retryable.

    Args:
        failure_type: The classified failure type

    Returns:
        True if the error should trigger a retry
    """
    non_retryable = {
        Crawl4AIFailureType.SCHEMA_VALIDATION_ERROR,
        Crawl4AIFailureType.CONTENT_PARSE_ERROR,
        Crawl4AIFailureType.SSL_ERROR,  # Usually config issue
    }
    return failure_type not in non_retryable


class Crawl4AIRetryHandler:
    """
    Retry handler for Crawl4AI operations with exponential backoff.

    Integrates with the existing failure classifier and provides detailed
    logging for debugging crawl failures.

    Example:
        >>> handler = Crawl4AIRetryHandler()
        >>> result = await handler.execute(
        ...     operation=lambda: engine.crawl(url),
        ...     url="https://example.com",
        ... )
        >>> if result.success:
        ...     print(result.result)
    """

    def __init__(
        self,
        retry_config: RetryConfig | None = None,
        circuit_breaker: CircuitBreaker | None = None,
        failure_classifier: FailureClassifier | None = None,
    ) -> None:
        """
        Initialize the retry handler.

        Args:
            retry_config: Retry configuration
            circuit_breaker: Circuit breaker instance
            failure_classifier: Optional failure classifier for integration
        """
        self.retry_config = retry_config or RetryConfig()
        self.circuit_breaker = circuit_breaker or CircuitBreaker()
        self.failure_classifier = failure_classifier or FailureClassifier()

        # Recovery callbacks
        self._recovery_handlers: dict[Crawl4AIFailureType, Callable[..., bool]] = {}

    def register_recovery_handler(
        self,
        failure_type: Crawl4AIFailureType,
        handler: Callable[..., bool],
    ) -> None:
        """Register a recovery handler for a specific failure type."""
        self._recovery_handlers[failure_type] = handler
        logger.info(f"Registered recovery handler for {failure_type.name}")

    def _calculate_delay(
        self,
        failure_type: Crawl4AIFailureType,
        attempt: int,
    ) -> float:
        """Calculate retry delay with exponential backoff and jitter."""
        # Select base delay based on failure type
        if failure_type in (
            Crawl4AIFailureType.CHALLENGE_DETECTED,
            Crawl4AIFailureType.BROWSER_FINGERPRINT_BLOCKED,
            Crawl4AIFailureType.BEHAVIOR_ANALYSIS_BLOCKED,
        ):
            base = self.retry_config.anti_bot_base_delay
        elif failure_type == Crawl4AIFailureType.CONNECTION_RESET:
            base = self.retry_config.rate_limit_base_delay
        elif failure_type == Crawl4AIFailureType.BROWSER_CRASHED:
            base = self.retry_config.browser_restart_delay
        else:
            base = self.retry_config.network_error_base_delay

        # Exponential backoff
        delay = base * (self.retry_config.exponential_base**attempt)
        delay = min(delay, self.retry_config.max_delay)

        # Add jitter to prevent thundering herd
        if self.retry_config.enable_jitter:
            jitter = delay * self.retry_config.jitter_factor * random.random()
            delay += jitter

        return delay

    async def execute(
        self,
        operation: Callable[[], T],
        url: str,
        operation_name: str = "crawl",
        stop_event: threading.Event | None = None,
        on_retry: Callable[[int, Exception, float], None] | None = None,
        max_retries: int | None = None,
    ) -> RetryResult:
        """
        Execute an operation with retry logic.

        Args:
            operation: The async operation to execute
            url: URL being crawled (for context and circuit breaker key)
            operation_name: Name of the operation for logging
            stop_event: Optional event for cancellation
            on_retry: Optional callback(attempt, error, delay)
            max_retries: Override max retries from config

        Returns:
            RetryResult with success status and details
        """
        circuit_key = self._extract_domain(url)

        # Check circuit breaker
        allowed, retry_after = self.circuit_breaker.check(circuit_key)
        if not allowed:
            logger.warning(f"Circuit breaker OPEN for {circuit_key}, retry after {retry_after:.1f}s")
            return RetryResult(
                success=False,
                error=Exception(f"Circuit breaker open for {circuit_key}"),
                attempts=0,
                circuit_open=True,
            )

        effective_max_retries = max_retries or self.retry_config.max_retries
        context = RetryContext(url=url, operation=operation_name)

        attempt = 0
        last_error: Exception | None = None
        last_failure_type: Crawl4AIFailureType | None = None
        last_base_failure_type: FailureType | None = None

        while attempt <= effective_max_retries:
            context.retry_count = attempt
            start_time = time.time()

            try:
                # Execute operation
                result = operation()
                if asyncio.iscoroutine(result):
                    result = await result

                # Success!
                duration = time.time() - start_time
                self.circuit_breaker.record_success(circuit_key)

                # Log successful retry if applicable
                if attempt > 0:
                    logger.info(f"Operation succeeded after {attempt + 1} attempts for {url} (total delay: {context.total_delay:.2f}s)")

                # Record success in failure classifier if integrated
                if self.failure_classifier:
                    # Could record success metrics here
                    pass

                return RetryResult(
                    success=True,
                    result=result,
                    attempts=attempt + 1,
                    total_delay=context.total_delay,
                )

            except Exception as exc:
                duration = time.time() - start_time
                last_error = exc

                # Classify the error
                failure_type, base_failure_type = classify_crawl4ai_error(exc, context)
                last_failure_type = failure_type
                last_base_failure_type = base_failure_type
                context.failure_type = failure_type
                context.base_failure_type = base_failure_type

                logger.warning(f"Attempt {attempt + 1}/{effective_max_retries + 1} failed for {url}: {failure_type.name} - {exc}")

                # Record failure in circuit breaker
                self.circuit_breaker.record_failure(circuit_key, failure_type)

                # Record in failure classifier for analytics
                failure_ctx = FailureContext(
                    failure_type=base_failure_type,
                    confidence=0.8,
                    details={
                        "url": url,
                        "operation": operation_name,
                        "crawl4ai_failure_type": failure_type.name,
                        "attempt": attempt,
                        "error": str(exc),
                    },
                    recovery_strategy="retry_with_backoff",
                )
                # Note: FailureClassifier doesn't have a direct record method,
                # but we could extend it or use the analytics system

                # Check if retryable
                if not is_retryable_crawl4ai_error(failure_type):
                    logger.info(f"Non-retryable error for {url}: {failure_type.name}")
                    return RetryResult(
                        success=False,
                        error=exc,
                        attempts=attempt + 1,
                        total_delay=context.total_delay,
                        failure_type=failure_type,
                        base_failure_type=base_failure_type,
                    )

                # Check max retries
                if attempt >= effective_max_retries:
                    logger.error(f"Max retries ({effective_max_retries}) exceeded for {url}")
                    return RetryResult(
                        success=False,
                        error=exc,
                        attempts=attempt + 1,
                        total_delay=context.total_delay,
                        failure_type=failure_type,
                        base_failure_type=base_failure_type,
                    )

                # Try recovery handler if available
                if failure_type in self._recovery_handlers:
                    logger.info(f"Attempting recovery for {failure_type.name}")
                    try:
                        handler = self._recovery_handlers[failure_type]
                        recovery_result = handler()
                        if asyncio.iscoroutine(recovery_result):
                            recovery_success = await recovery_result
                        else:
                            recovery_success = recovery_result

                        if recovery_success:
                            logger.info(f"Recovery successful for {failure_type.name}")
                            # Don't increment attempt after successful recovery
                            continue
                    except Exception as recovery_exc:
                        logger.warning(f"Recovery failed: {recovery_exc}")

                # Calculate delay
                delay = self._calculate_delay(failure_type, attempt)
                context.total_delay += delay

                # Notify callback
                if on_retry:
                    try:
                        on_retry(attempt, exc, delay)
                    except Exception as cb_err:
                        logger.debug(f"Retry callback error: {cb_err}")

                # Check cancellation
                if stop_event and stop_event.is_set():
                    logger.warning(f"Retry cancelled for {url} after {attempt + 1} attempts")
                    return RetryResult(
                        success=False,
                        error=exc,
                        attempts=attempt + 1,
                        total_delay=context.total_delay,
                        failure_type=failure_type,
                        base_failure_type=base_failure_type,
                        cancelled=True,
                    )

                logger.info(f"Waiting {delay:.2f}s before retry {attempt + 2} for {url}")
                await asyncio.sleep(delay)

                attempt += 1

        # Should not reach here
        return RetryResult(
            success=False,
            error=last_error,
            attempts=attempt,
            total_delay=context.total_delay,
            failure_type=last_failure_type,
            base_failure_type=last_base_failure_type,
        )

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL for circuit breaker key."""
        try:
            from urllib.parse import urlparse

            parsed = urlparse(url)
            return parsed.netloc or url
        except Exception:
            return url


# Convenience decorator for retry logic
def with_crawl4ai_retry(
    max_retries: int | None = None,
    base_delay: float | None = None,
    circuit_breaker: CircuitBreaker | None = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Decorator for adding Crawl4AI retry logic to async functions.

    Args:
        max_retries: Maximum retry attempts
        base_delay: Base delay between retries
        circuit_breaker: Optional circuit breaker instance

    Example:
        >>> @with_crawl4ai_retry(max_retries=3)
        ... async def crawl_page(url: str) -> CrawlResult:
        ...     return await engine.crawl(url)
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        handler = Crawl4AIRetryHandler(
            retry_config=RetryConfig(
                max_retries=max_retries or 3,
                base_delay=base_delay or 1.0,
            ),
            circuit_breaker=circuit_breaker or CircuitBreaker(),
        )

        async def wrapper(*args: Any, **kwargs: Any) -> T:
            # Try to extract URL from args/kwargs for context
            url = kwargs.get("url", args[0] if args else "unknown")

            result = await handler.execute(
                operation=lambda: func(*args, **kwargs),
                url=str(url),
                operation_name=func.__name__,
            )

            if result.success:
                return result.result

            if result.error:
                raise result.error

            raise RuntimeError("Retry failed without error")

        return wrapper

    return decorator


__all__ = [
    # Enums
    "Crawl4AIFailureType",
    "CircuitBreakerState",
    # Config classes
    "CircuitBreakerConfig",
    "RetryConfig",
    "RetryContext",
    "RetryResult",
    # Core classes
    "CircuitBreaker",
    "Crawl4AIRetryHandler",
    # Functions
    "classify_crawl4ai_error",
    "is_retryable_crawl4ai_error",
    "with_crawl4ai_retry",
]
