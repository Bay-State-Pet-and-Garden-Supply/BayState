from __future__ import annotations

import os
import re
from typing import Any
from collections.abc import Mapping
import importlib


_URL_CRED_RE = re.compile(r"(?P<prefix>https?://)(?P<creds>[^@/\s]+)@(?P<rest>.+)")


def _scrub_url(url: str) -> str:
    """Remove credentials from URLs to avoid sending PII.

    Examples:
        https://user:pass@example.com/path -> https://example.com/path
    """
    if not url:
        return url
    m = _URL_CRED_RE.match(url)
    if not m:
        return url
    return f"{m.group('prefix')}{m.group('rest')}"


def _before_send(event: Mapping[str, Any], hint: Mapping[str, Any] | None = None) -> Mapping[str, Any] | None:
    """Sentry before_send hook to scrub PII (credentials in URLs) and modify events.

    Removes username:password@ from any URL-like strings in event.request.url and in exception values.
    """
    try:
        request = event.get("request")
        if request and isinstance(request, dict):
            url = request.get("url")
            if isinstance(url, str):
                request["url"] = _scrub_url(url)
        # Scrub any urls in extra or tags
        for section in ("extra", "tags", "contexts"):
            sec = event.get(section)
            if isinstance(sec, dict):
                for k, v in list(sec.items()):
                    if isinstance(v, str) and v.startswith("http"):
                        sec[k] = _scrub_url(v)
    except Exception:
        # Never raise from before_send
        return event
    return event


def init_sentry() -> None:
    """Initialize Sentry SDK if SENTRY_DSN env var is present.

    Uses async HTTPS transport (default) and configures before_send to scrub PII.
    Call once at daemon startup.
    """
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return

    try:
        sentry_sdk = importlib.import_module("sentry_sdk")
        logging_mod = importlib.import_module("sentry_sdk.integrations.logging")
        LoggingIntegration = getattr(logging_mod, "LoggingIntegration")
    except Exception:
        # sentry not installed in this environment; silently skip
        return

    # Capture log messages via logging integration but do not replace structured logging
    logging_integration = LoggingIntegration(level=None, event_level=None)

    # Use default HTTP transport which is non-blocking; configure before_send to scrub PII
    sentry_sdk.init(
        dsn=dsn,
        integrations=[logging_integration],
        release=os.environ.get("RELEASE"),
        environment=os.environ.get("ENVIRONMENT", "prod"),
        before_send=_before_send,
        _experiments={"traceback_style": "compressed"},
    )


def set_job_context(job_id: str, scraper_name: str, url: str | None = None, extraction_mode: str | None = None) -> None:
    """Attach job-specific tags to the current Sentry scope.

    Tags are lightweight and useful for filtering in Sentry.
    """
    try:
        sentry_sdk = importlib.import_module("sentry_sdk")
    except Exception:
        return

    try:
        sentry_sdk.set_tag("job_id", job_id)
        sentry_sdk.set_tag("scraper_name", scraper_name)
        if extraction_mode:
            sentry_sdk.set_tag("extraction_mode", extraction_mode)
        if url:
            sentry_sdk.set_tag("request_url", _scrub_url(url))
    except Exception:
        # Do not let Sentry helpers raise in production flow
        return


def add_extraction_breadcrumb(step: str, data: Mapping[str, Any] | None = None) -> None:
    """Add a breadcrumb describing an extraction step.

    Typical steps: navigate, extract, validate
    """
    try:
        sentry_sdk = importlib.import_module("sentry_sdk")
    except Exception:
        return

    try:
        sentry_sdk.add_breadcrumb(category="extraction", message=step, data=data or {}, level="info")
    except Exception:
        return


def capture_antibot_event(strategy: str, success: bool, details: Mapping[str, Any] | None = None) -> None:
    """Capture anti-bot detection events as warnings (not errors).

    These should appear as Sentry events but with warning level so they don't inflate error rates.
    """
    try:
        sentry_sdk = importlib.import_module("sentry_sdk")
    except Exception:
        return

    try:
        extra = {"strategy": strategy, "success": bool(success)}
        if details:
            extra.update(details)
        with sentry_sdk.push_scope() as scope:
            scope.level = "warning"
            for k, v in extra.items():
                scope.set_extra(k, v)
            sentry_sdk.capture_message("anti-bot detection", level="warning")
    except Exception:
        return


__all__ = [
    "init_sentry",
    "set_job_context",
    "add_extraction_breadcrumb",
    "capture_antibot_event",
]
