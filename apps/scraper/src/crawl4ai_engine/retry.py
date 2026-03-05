from __future__ import annotations

import asyncio
import functools
import importlib
import logging
import random
import time
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from enum import Enum
from inspect import isawaitable, iscoroutinefunction
from threading import RLock
from typing import ParamSpec, Protocol, TypeVar, cast, runtime_checkable

from core.failure_classifier import FailureClassifier, FailureType
from scrapers.exceptions import (
    AccessDeniedError,
    CaptchaError,
    CircuitBreakerOpenError,
    ErrorContext,
    NonRetryableError,
    PageNotFoundError,
    RateLimitError,
    RetryableError,
    ScraperError,
    classify_exception,
)

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


@runtime_checkable
class AdaptiveStrategyProtocol(Protocol):
    def get_adaptive_config(self, failure_type: FailureType, site_name: str, current_retry_count: int = 0) -> object: ...

    def calculate_delay(self, config: object, retry_count: int) -> float: ...


@runtime_checkable
class RetryExecutorProtocol(Protocol):
    adaptive_strategy: AdaptiveStrategyProtocol


class ErrorCategory(Enum):
    TRANSIENT = "transient"
    PERMANENT = "permanent"
    ANTI_BOT = "anti_bot"


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass(frozen=True)
class ErrorClassification:
    category: ErrorCategory
    retryable: bool
    reason: str
    failure_type: FailureType | None = None
    scraper_error: ScraperError | None = None


@dataclass(frozen=True)
class RetryPolicy:
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    jitter_seconds: float = 1.0
    anti_bot_max_retries: int = 1
    anti_bot_base_delay: float = 30.0
    anti_bot_max_delay: float = 300.0


@dataclass(frozen=True)
class CircuitBreakerConfig:
    failure_threshold: int = 5
    failure_window_seconds: float = 60.0
    cooldown_seconds: float = 30.0
    half_open_max_calls: int = 1


@dataclass
class CircuitBreaker:
    config: CircuitBreakerConfig = field(default_factory=CircuitBreakerConfig)
    state: CircuitState = CircuitState.CLOSED
    failures: deque[float] = field(default_factory=deque)
    last_failure_time: float | None = None
    opened_at: float | None = None
    half_open_calls: int = 0
    _lock: RLock = field(default_factory=RLock, init=False, repr=False)

    def can_execute(self) -> bool:
        with self._lock:
            now = time.monotonic()
            self._prune_failures(now)

            if self.state == CircuitState.CLOSED:
                return True

            if self.state == CircuitState.OPEN:
                if self.opened_at is None:
                    return False
                elapsed = now - self.opened_at
                if elapsed < self.config.cooldown_seconds:
                    return False
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0

            if self.half_open_calls >= self.config.half_open_max_calls:
                return False

            self.half_open_calls += 1
            return True

    def record_success(self) -> None:
        with self._lock:
            self.state = CircuitState.CLOSED
            self.failures.clear()
            self.last_failure_time = None
            self.opened_at = None
            self.half_open_calls = 0

    def record_failure(self, category: ErrorCategory) -> None:
        with self._lock:
            now = time.monotonic()
            self.last_failure_time = now

            if self.state == CircuitState.HALF_OPEN:
                self._trip_open(now)
                return

            if category == ErrorCategory.PERMANENT:
                return

            self.failures.append(now)
            self._prune_failures(now)
            if len(self.failures) >= self.config.failure_threshold:
                self._trip_open(now)

    def status(self) -> dict[str, float | int | str | None]:
        with self._lock:
            now = time.monotonic()
            self._prune_failures(now)
            count = len(self.failures)
            rate = count / self.config.failure_window_seconds

            seconds_until_half_open = 0.0
            if self.state == CircuitState.OPEN and self.opened_at is not None:
                seconds_until_half_open = max(0.0, self.config.cooldown_seconds - (now - self.opened_at))

            return {
                "state": self.state.value,
                "failure_count": count,
                "failure_window_seconds": self.config.failure_window_seconds,
                "failure_rate_per_second": rate,
                "last_failure_time": self.last_failure_time,
                "seconds_until_half_open": seconds_until_half_open,
            }

    def _prune_failures(self, now: float) -> None:
        cutoff = now - self.config.failure_window_seconds
        while self.failures and self.failures[0] < cutoff:
            _ = self.failures.popleft()

    def _trip_open(self, now: float) -> None:
        self.state = CircuitState.OPEN
        self.opened_at = now
        self.half_open_calls = 0


ANTI_BOT_KEYWORDS: tuple[str, ...] = (
    "captcha",
    "recaptcha",
    "hcaptcha",
    "bot",
    "automated",
    "suspicious",
    "blocked",
    "denied",
    "cloudflare",
    "human verification",
)

TRANSIENT_KEYWORDS: tuple[str, ...] = (
    "timeout",
    "timed out",
    "rate limit",
    "ratelimit",
    "too many requests",
    "temporary",
    "temporarily",
    "connection",
    "network",
    "dns",
)

PERMANENT_KEYWORDS: tuple[str, ...] = (
    "404",
    "not found",
    "invalid config",
    "invalid configuration",
    "authentication failed",
    "unauthorized",
    "invalid api key",
)

ANTI_BOT_FAILURE_TYPES: tuple[FailureType, ...] = (
    FailureType.CAPTCHA_DETECTED,
    FailureType.ACCESS_DENIED,
)

TRANSIENT_FAILURE_TYPES: tuple[FailureType, ...] = (
    FailureType.NETWORK_ERROR,
    FailureType.RATE_LIMITED,
    FailureType.TIMEOUT,
    FailureType.ELEMENT_MISSING,
)

PERMANENT_FAILURE_TYPES: tuple[FailureType, ...] = (
    FailureType.PAGE_NOT_FOUND,
    FailureType.LOGIN_FAILED,
    FailureType.NO_RESULTS,
)


def classify_error(
    exc: Exception,
    *,
    context: Mapping[str, object] | None = None,
    failure_classifier: FailureClassifier | None = None,
) -> ErrorClassification:
    raw_context = dict(context or {})
    message = str(exc).lower()

    error_context = _to_error_context(raw_context)
    try:
        scraper_error = classify_exception(exc, error_context)
    except Exception:
        scraper_error = None

    classifier = failure_classifier or FailureClassifier()
    detected_failure_type: FailureType | None = None
    try:
        classifier_result = classifier.classify_exception(exc, raw_context)
        detected_failure_type = classifier_result.failure_type
    except Exception:
        detected_failure_type = None

    if isinstance(scraper_error, (CaptchaError, AccessDeniedError)):
        return ErrorClassification(
            category=ErrorCategory.ANTI_BOT,
            retryable=True,
            reason=f"scraper:{type(scraper_error).__name__}",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    if detected_failure_type in ANTI_BOT_FAILURE_TYPES or _contains_keyword(message, ANTI_BOT_KEYWORDS):
        return ErrorClassification(
            category=ErrorCategory.ANTI_BOT,
            retryable=True,
            reason="pattern:anti_bot",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    if isinstance(scraper_error, (PageNotFoundError, NonRetryableError)):
        return ErrorClassification(
            category=ErrorCategory.PERMANENT,
            retryable=False,
            reason=f"scraper:{type(scraper_error).__name__}",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    if detected_failure_type in PERMANENT_FAILURE_TYPES or _contains_keyword(message, PERMANENT_KEYWORDS):
        return ErrorClassification(
            category=ErrorCategory.PERMANENT,
            retryable=False,
            reason="pattern:permanent",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    if isinstance(scraper_error, (RateLimitError, RetryableError)):
        return ErrorClassification(
            category=ErrorCategory.TRANSIENT,
            retryable=True,
            reason=f"scraper:{type(scraper_error).__name__}",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    if detected_failure_type in TRANSIENT_FAILURE_TYPES or _contains_keyword(message, TRANSIENT_KEYWORDS):
        return ErrorClassification(
            category=ErrorCategory.TRANSIENT,
            retryable=True,
            reason="pattern:transient",
            failure_type=detected_failure_type,
            scraper_error=scraper_error,
        )

    retryable = True
    if isinstance(scraper_error, ScraperError):
        retryable = scraper_error.retryable

    return ErrorClassification(
        category=ErrorCategory.TRANSIENT if retryable else ErrorCategory.PERMANENT,
        retryable=retryable,
        reason="fallback",
        failure_type=detected_failure_type,
        scraper_error=scraper_error,
    )


RetryCallback = Callable[[int, Exception, float, ErrorClassification], None]


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    jitter_seconds: float = 1.0,
    *,
    anti_bot_max_retries: int = 1,
    anti_bot_base_delay: float = 30.0,
    anti_bot_max_delay: float = 300.0,
    circuit_breaker: CircuitBreaker | None = None,
    failure_classifier: FailureClassifier | None = None,
    retry_executor: RetryExecutorProtocol | None = None,
    site_name: str = "crawl4ai",
    action_name: str | None = None,
    context: Mapping[str, object] | None = None,
    on_retry: RetryCallback | None = None,
) -> Callable[[Callable[P, object]], Callable[P, object]]:
    policy = RetryPolicy(
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        jitter_seconds=jitter_seconds,
        anti_bot_max_retries=anti_bot_max_retries,
        anti_bot_base_delay=anti_bot_base_delay,
        anti_bot_max_delay=anti_bot_max_delay,
    )

    def decorator(func: Callable[P, object]) -> Callable[P, object]:
        resolved_action = action_name or func.__name__

        @functools.wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> object:
            async def operation() -> object:
                result_or_awaitable = func(*args, **kwargs)
                if isawaitable(result_or_awaitable):
                    return await cast(Awaitable[object], result_or_awaitable)
                return result_or_awaitable

            return await execute_with_retry(
                operation,
                policy=policy,
                circuit_breaker=circuit_breaker,
                failure_classifier=failure_classifier,
                retry_executor=retry_executor,
                site_name=site_name,
                action_name=resolved_action,
                context=context,
                on_retry=on_retry,
            )

        @functools.wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> object:
            try:
                _ = asyncio.get_running_loop()
            except RuntimeError:
                return asyncio.run(async_wrapper(*args, **kwargs))

            raise RuntimeError("retry_with_backoff cannot wrap a sync function inside an active event loop")

        if iscoroutinefunction(func):
            return cast(Callable[P, object], async_wrapper)

        return cast(Callable[P, object], sync_wrapper)

    return decorator


async def execute_with_retry(
    operation: Callable[[], Awaitable[T] | T],
    *,
    policy: RetryPolicy | None = None,
    circuit_breaker: CircuitBreaker | None = None,
    failure_classifier: FailureClassifier | None = None,
    retry_executor: RetryExecutorProtocol | None = None,
    site_name: str = "crawl4ai",
    action_name: str = "crawl",
    context: Mapping[str, object] | None = None,
    on_retry: RetryCallback | None = None,
) -> T:
    effective_policy = policy or RetryPolicy()
    effective_context: dict[str, object] = dict(context or {})
    _ = effective_context.setdefault("site_name", site_name)
    _ = effective_context.setdefault("action", action_name)
    resolved_executor = retry_executor if retry_executor is not None else _load_integrated_retry_executor()

    attempt = 0
    while True:
        if circuit_breaker and not circuit_breaker.can_execute():
            raise CircuitBreakerOpenError(
                f"Circuit breaker open for {site_name}/{action_name}",
                context=_to_error_context(effective_context),
            )

        try:
            result_or_awaitable = operation()
            if isawaitable(result_or_awaitable):
                result = await cast(Awaitable[T], result_or_awaitable)
            else:
                result = cast(T, result_or_awaitable)

            if circuit_breaker:
                circuit_breaker.record_success()
            return result

        except Exception as exc:
            classification = classify_error(
                exc,
                context=effective_context,
                failure_classifier=failure_classifier,
            )

            if circuit_breaker:
                circuit_breaker.record_failure(classification.category)

            allowed_retries = effective_policy.max_retries
            if classification.category == ErrorCategory.ANTI_BOT:
                allowed_retries = min(allowed_retries, effective_policy.anti_bot_max_retries)

            if (not classification.retryable) or (attempt >= allowed_retries):
                if classification.scraper_error is not None:
                    raise classification.scraper_error from exc
                raise

            delay = _calculate_retry_delay(
                attempt=attempt,
                classification=classification,
                policy=effective_policy,
                retry_executor=resolved_executor,
                site_name=site_name,
            )

            if on_retry:
                try:
                    on_retry(attempt + 1, exc, delay, classification)
                except Exception:
                    logger.debug("Retry callback failed", exc_info=True)

            logger.warning(
                "Retrying %s/%s in %.2fs (attempt %s/%s, category=%s)",
                site_name,
                action_name,
                delay,
                attempt + 2,
                allowed_retries + 1,
                classification.category.value,
            )

            await asyncio.sleep(delay)
            attempt += 1


def _calculate_retry_delay(
    *,
    attempt: int,
    classification: ErrorClassification,
    policy: RetryPolicy,
    retry_executor: RetryExecutorProtocol | None,
    site_name: str,
) -> float:
    multiplier = float(1 << attempt)
    if classification.category == ErrorCategory.ANTI_BOT:
        base_delay = min(policy.anti_bot_base_delay * multiplier, policy.anti_bot_max_delay)
    else:
        adaptive_delay = _calculate_adaptive_delay(
            retry_executor=retry_executor,
            failure_type=classification.failure_type,
            site_name=site_name,
            attempt=attempt,
        )
        if adaptive_delay is None:
            base_delay = min(policy.base_delay * multiplier, policy.max_delay)
        else:
            base_delay = min(adaptive_delay, policy.max_delay)

    jitter = random.uniform(0.0, max(0.0, policy.jitter_seconds))
    return base_delay + jitter


def _calculate_adaptive_delay(
    *,
    retry_executor: RetryExecutorProtocol | None,
    failure_type: FailureType | None,
    site_name: str,
    attempt: int,
) -> float | None:
    if retry_executor is None or failure_type is None:
        return None

    try:
        strategy = retry_executor.adaptive_strategy
        config = strategy.get_adaptive_config(
            failure_type,
            site_name,
            current_retry_count=attempt,
        )
        return strategy.calculate_delay(config, attempt)
    except Exception:
        logger.debug("Adaptive delay unavailable", exc_info=True)
        return None


_default_retry_executor: RetryExecutorProtocol | None = None
_default_retry_executor_resolved = False


def _load_integrated_retry_executor() -> RetryExecutorProtocol | None:
    global _default_retry_executor, _default_retry_executor_resolved
    if _default_retry_executor_resolved:
        return _default_retry_executor

    _default_retry_executor_resolved = True

    for module_name in ("scraper_backend.core.retry", "core.retry_executor"):
        try:
            module = importlib.import_module(module_name)
            cls_obj = getattr(module, "RetryExecutor", None)
            if not callable(cls_obj):
                continue
            candidate = cls_obj()
            resolved = _as_retry_executor(candidate)
            if resolved is None:
                continue
            _default_retry_executor = resolved
            break
        except Exception:
            continue

    return _default_retry_executor


def _as_retry_executor(value: object) -> RetryExecutorProtocol | None:
    if not isinstance(value, RetryExecutorProtocol):
        return None

    return value


def _to_error_context(context: Mapping[str, object]) -> ErrorContext:
    return ErrorContext(
        site_name=_as_str(context.get("site_name")),
        action=_as_str(context.get("action")),
        step_index=_as_int_or_none(context.get("step_index")),
        selector=_as_str(context.get("selector")),
        url=_as_str(context.get("url")),
        sku=_as_str(context.get("sku")),
        retry_count=_as_int_or_default(context.get("retry_count"), 0),
        max_retries=_as_int_or_default(context.get("max_retries"), 1),
        extra={
            key: value
            for key, value in context.items()
            if key not in {"site_name", "action", "step_index", "selector", "url", "sku", "retry_count", "max_retries"}
        },
    )


def _contains_keyword(value: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in value for keyword in keywords)


def _as_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned


def _as_int_or_none(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return int(cleaned)
        except ValueError:
            return None
    return None


def _as_int_or_default(value: object, default: int) -> int:
    parsed = _as_int_or_none(value)
    if parsed is None:
        return default
    return parsed


__all__ = [
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitState",
    "ErrorCategory",
    "ErrorClassification",
    "RetryPolicy",
    "classify_error",
    "execute_with_retry",
    "retry_with_backoff",
]
