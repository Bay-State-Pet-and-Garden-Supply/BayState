from __future__ import annotations

import pytest

from scrapers.exceptions import (
    AccessDeniedError,
    ElementNotFoundError,
    NetworkError,
    RateLimitError,
    TimeoutError,
    classify_exception,
)


def test_classify_timeout_error_includes_hint():
    """Test that TimeoutError includes the correct retry hint."""
    exc = Exception("Playwright timeout")
    classified = classify_exception(exc)
    
    assert isinstance(classified, TimeoutError)
    assert classified.retry_hint == "Increase timeout multiplier and retry"


def test_classify_access_denied_includes_hint_and_action():
    """Test that AccessDeniedError includes hint and recovery action."""
    exc = Exception("403 Forbidden")
    classified = classify_exception(exc)
    
    assert isinstance(classified, AccessDeniedError)
    assert classified.retry_hint == "Rotate session or update anti-detection config"
    assert classified.recovery_action == "rotate_session"


def test_classify_element_missing_includes_hint():
    """Test that ElementNotFoundError includes the correct retry hint."""
    exc = Exception("waiting for selector \".price\" failed")
    classified = classify_exception(exc)
    
    assert isinstance(classified, ElementNotFoundError)
    assert classified.retry_hint == "Wait longer or check if site layout changed"


def test_error_message_formatting_includes_hint():
    """Test that the formatted error message includes the retry hint."""
    err = TimeoutError("Slow page", retry_hint="Wait more")
    msg = str(err)
    
    assert "Slow page" in msg
    assert "hint=Wait more" in msg
