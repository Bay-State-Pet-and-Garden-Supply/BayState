"""Login page detection utilities for HTML content validation.

Prevents AI extraction from processing login pages as product data.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class LoginDetectionResult:
    """Result of login page detection."""

    is_login_page: bool
    confidence: float  # 0.0 to 1.0
    indicators: list[str]  # Which indicators were found
    details: dict[str, Any]


class LoginPageDetector:
    """Detects login pages from HTML content before AI extraction.

    Uses multiple detection strategies:
    1. Title patterns ("Sign In", "Log In", etc.)
    2. Form detection (password fields, login forms)
    3. Text patterns ("login", "authenticate", etc.)
    4. URL patterns ("/login", "/signin", etc.)
    """

    # Title patterns that strongly indicate login pages
    TITLE_PATTERNS = [
        r"^\s*sign\s*in\s*$",
        r"^\s*log\s*in\s*$",
        r"^\s*login\s*$",
        r"^\s*signin\s*$",
        r"^\s*authentication\s*$",
        r"^\s*authenticate\s*$",
        r"sign\s*in\s*(to|with)",
        r"log\s*in\s*(to|with)",
        r"login\s*(to|with)",
        r"signin\s*(to|with)",
        r"member\s*login",
        r"customer\s*login",
        r"account\s*login",
        r"user\s*login",
        r"welcome\s*back",
    ]

    # Text content patterns indicating login pages
    TEXT_PATTERNS = [
        r"sign\s*in\s*(to|with|using)",
        r"log\s*in\s*(to|with|using)",
        r"login\s*(to|with|using)",
        r"enter\s*your\s*(username|password|email)",
        r"forgot\s*(your\s*)?password",
        r"remember\s*me",
        r"keep\s*me\s*signed\s*in",
        r"keep\s*me\s*logged\s*in",
        r"create\s*an?\s*account",
        r"don't\s*have\s*an?\s*account",
        r"new\s*user\?",
        r"existing\s*user\?",
        r"member\s*sign\s*in",
        r"customer\s*sign\s*in",
        r"account\s*sign\s*in",
    ]

    # HTML patterns for login forms
    FORM_PATTERNS = [
        r'<input[^>]*type\s*=\s*["\']password["\'][^>]*>',  # Password input
        r'<input[^>]*name\s*=\s*["\']password["\'][^>]*>',  # Password field by name
        r"<input[^>]*id\s*=\s*[^>]*password[^>]*>",  # Password field by id
        r"<form[^>]*action\s*=\s*[^>]*(?:login|signin|authenticate)[^>]*>",  # Login form action
        r'<button[^>]*type\s*=\s*["\']submit["\'][^>]*>\s*(?:sign\s*in|log\s*in|login|submit)\s*</button>',  # Login button
    ]

    # URL path patterns
    URL_PATTERNS = [
        r"/login",
        r"/signin",
        r"/sign-in",
        r"/log-in",
        r"/authenticate",
        r"/auth",
        r"/account/login",
        r"/customer/login",
        r"/member/login",
    ]

    def __init__(self) -> None:
        """Initialize the detector with compiled patterns."""
        self._title_regexes = [re.compile(p, re.IGNORECASE) for p in self.TITLE_PATTERNS]
        self._text_regexes = [re.compile(p, re.IGNORECASE) for p in self.TEXT_PATTERNS]
        self._form_regexes = [re.compile(p, re.IGNORECASE) for p in self.FORM_PATTERNS]
        self._url_regexes = [re.compile(p, re.IGNORECASE) for p in self.URL_PATTERNS]

    def detect(
        self,
        html: str,
        url: str = "",
        title: str = "",
    ) -> LoginDetectionResult:
        """Detect if the given HTML content is a login page.

        Args:
            html: Raw HTML content
            url: Optional URL for path-based detection
            title: Optional page title (already extracted)

        Returns:
            LoginDetectionResult with detection details
        """
        indicators: list[str] = []
        confidence_scores: list[float] = []

        # Check title if provided or extract it
        if not title and html:
            title = self._extract_title(html)

        if title:
            title_check = self._check_title(title)
            if title_check:
                indicators.append(f"title: '{title}'")
                confidence_scores.append(0.9)  # High confidence for title match

        # Check URL path
        if url:
            url_check = self._check_url(url)
            if url_check:
                indicators.append(f"url_path: '{url}'")
                confidence_scores.append(0.7)

        # Check for login form patterns
        form_check = self._check_form_patterns(html)
        if form_check:
            indicators.append("login_form_elements")
            confidence_scores.append(0.8)

        # Check text content patterns
        text_check = self._check_text_patterns(html)
        if text_check:
            indicators.append("login_text_patterns")
            confidence_scores.append(0.6)

        # Calculate overall confidence
        if confidence_scores:
            # Use highest confidence but boost if multiple indicators
            base_confidence = max(confidence_scores)
            indicator_bonus = min(len(indicators) * 0.1, 0.2)  # Up to 0.2 bonus
            final_confidence = min(base_confidence + indicator_bonus, 1.0)
        else:
            final_confidence = 0.0

        is_login = final_confidence >= 0.5  # Threshold for detection

        if is_login:
            logger.warning(f"Login page detected (confidence: {final_confidence:.2f}){f' - URL: {url}' if url else ''}{f' - Title: {title}' if title else ''}")

        return LoginDetectionResult(
            is_login_page=is_login,
            confidence=final_confidence,
            indicators=indicators,
            details={
                "title": title,
                "url": url,
                "indicators_found": len(indicators),
            },
        )

    def _extract_title(self, html: str) -> str:
        """Extract title from HTML."""
        try:
            match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1).strip()
        except Exception:
            pass
        return ""

    def _check_title(self, title: str) -> bool:
        """Check if title matches login page patterns."""
        for pattern in self._title_regexes:
            if pattern.search(title):
                return True
        return False

    def _check_url(self, url: str) -> bool:
        """Check if URL path matches login patterns."""
        # Extract path from URL
        try:
            from urllib.parse import urlparse

            parsed = urlparse(url)
            path = parsed.path.lower()
            for pattern in self._url_regexes:
                if pattern.search(path):
                    return True
        except Exception:
            # Fallback to simple string matching
            url_lower = url.lower()
            for pattern in self.URL_PATTERNS:
                if pattern.lower() in url_lower:
                    return True
        return False

    def _check_form_patterns(self, html: str) -> bool:
        """Check for login form elements in HTML."""
        # Look for password field + some login indicator
        has_password = False
        has_login_indicator = False

        for pattern in self._form_regexes:
            if pattern.search(html):
                # Check if it's a password field pattern
                if "password" in pattern.pattern.lower():
                    has_password = True
                else:
                    has_login_indicator = True

        # Strong signal: password field present
        if has_password:
            return True

        # Medium signal: login button without password might still be login page
        if has_login_indicator and self._check_text_patterns(html):
            return True

        return False

    def _check_text_patterns(self, html: str) -> bool:
        """Check for login-related text patterns in HTML."""
        # Extract text content (simple approach - remove tags)
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()

        matches = 0
        for pattern in self._text_regexes:
            if pattern.search(text):
                matches += 1
                if matches >= 2:  # Need at least 2 text patterns for confidence
                    return True

        return False


# Singleton instance for reuse
_default_detector: LoginPageDetector | None = None


def get_login_detector() -> LoginPageDetector:
    """Get the default login page detector instance."""
    global _default_detector
    if _default_detector is None:
        _default_detector = LoginPageDetector()
    return _default_detector


def is_login_page(
    html: str,
    url: str = "",
    title: str = "",
    confidence_threshold: float = 0.5,
) -> bool:
    """Quick check if HTML content is a login page.

    Args:
        html: Raw HTML content
        url: Optional URL for path-based detection
        title: Optional page title
        confidence_threshold: Minimum confidence to consider as login page

    Returns:
        True if the content appears to be a login page
    """
    detector = get_login_detector()
    result = detector.detect(html, url, title)
    return result.is_login_page and result.confidence >= confidence_threshold
