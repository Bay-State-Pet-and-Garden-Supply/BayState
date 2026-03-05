"""Tests for login page detection utility."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# Load login_detection module directly without going through crawl4ai_engine package
# (the package __init__.py has problematic imports that fail in test context)
# Path: tests/unit/crawl4ai_engine/test_login_detection.py -> src/crawl4ai_engine/login_detection.py
_module_path = Path(__file__).parent.parent.parent.parent / "src" / "crawl4ai_engine" / "login_detection.py"
_spec = importlib.util.spec_from_file_location("login_detection", _module_path)
_login_detection = importlib.util.module_from_spec(_spec)
sys.modules["login_detection"] = _login_detection
_spec.loader.exec_module(_login_detection)

LoginPageDetector = _login_detection.LoginPageDetector
is_login_page = _login_detection.is_login_page

import pytest


class TestLoginPageDetector:
    """Test cases for LoginPageDetector."""

    @pytest.fixture
    def detector(self):
        """Create a fresh detector instance."""
        return LoginPageDetector()

    def test_sign_in_title_detection(self, detector):
        """Test detection of 'Sign In' title (the reported bug case)."""
        html = """
        <html>
        <head><title>Sign In</title></head>
        <body>
            <h1>Sign In</h1>
            <form>
                <input type="email" name="username" />
                <input type="password" name="password" />
                <button type="submit">Sign In</button>
            </form>
        </body>
        </html>
        """
        result = detector.detect(html)
        assert result.is_login_page is True
        assert result.confidence >= 0.5
        assert any("title" in indicator for indicator in result.indicators)

    def test_login_title_variations(self, detector):
        """Test various login-related title patterns."""
        titles = [
            "Sign In",
            "Log In",
            "Login",
            "Signin",
            "Sign in to Your Account",
            "Log in with Email",
            "Member Login",
            "Customer Login",
            "Account Login",
            "Authentication",
        ]

        for title in titles:
            html = f"<html><head><title>{title}</title></head><body></body></html>"
            result = detector.detect(html, title=title)
            assert result.is_login_page is True, f"Failed to detect login page with title: {title}"
            assert result.confidence >= 0.5

    def test_password_field_detection(self, detector):
        """Test detection via password input field."""
        html = """
        <html>
        <body>
            <form action="/login" method="post">
                <input type="text" name="username" placeholder="Username" />
                <input type="password" name="password" placeholder="Password" />
                <button type="submit">Submit</button>
            </form>
        </body>
        </html>
        """
        result = detector.detect(html)
        assert result.is_login_page is True
        assert any("form" in indicator for indicator in result.indicators)

    def test_url_path_detection(self, detector):
        """Test detection via URL path patterns."""
        urls = [
            "https://example.com/login",
            "https://example.com/signin",
            "https://example.com/sign-in",
            "https://example.com/log-in",
            "https://example.com/authenticate",
            "https://example.com/auth",
            "https://example.com/account/login",
            "https://example.com/customer/login",
        ]

        for url in urls:
            html = "<html><body>Login Page</body></html>"
            result = detector.detect(html, url=url)
            assert result.is_login_page is True, f"Failed to detect login page for URL: {url}"

    def test_text_pattern_detection(self, detector):
        """Test detection via text content patterns."""
        html = """
        <html>
        <body>
            <h1>Welcome Back</h1>
            <p>Sign in to continue</p>
            <p>Enter your email and password</p>
            <form>
                <input type="text" name="email" />
                <input type="password" name="password" />
            </form>
            <p>Forgot your password?</p>
        </body>
        </html>
        """
        result = detector.detect(html)
        assert result.is_login_page is True
        # Should have multiple indicators (text patterns + form)
        assert len(result.indicators) >= 1

    def test_non_login_page(self, detector):
        """Test that normal product pages are not flagged as login."""
        html = """
        <html>
        <head><title>Premium Dog Food - 20lb Bag</title></head>
        <body>
            <h1>Premium Dog Food</h1>
            <p>High-quality nutrition for your pet.</p>
            <div class="price">$29.99</div>
            <button>Add to Cart</button>
        </body>
        </html>
        """
        result = detector.detect(html)
        assert result.is_login_page is False
        assert result.confidence < 0.5

    def test_edge_case_login_in_product_name(self, detector):
        """Test that 'Login' in product name doesn't trigger false positive."""
        html = """
        <html>
        <head><title>Loginitol Dog Supplement</title></head>
        <body>
            <h1>Loginitol Dog Supplement</h1>
            <p>Helps with joint health.</p>
            <div class="price">$19.99</div>
        </body>
        </html>
        """
        result = detector.detect(html)
        # Should not be detected as login page (no password field, no login button)
        assert result.is_login_page is False

    def test_confidence_threshold(self, detector):
        """Test that confidence scores are within expected ranges."""
        # Strong login indicators
        strong_html = """
        <html>
        <head><title>Sign In</title></head>
        <body>
            <input type="password" />
            <button>Sign In</button>
        </body>
        </html>
        """
        result = detector.detect(strong_html)
        assert result.confidence >= 0.7  # High confidence for strong indicators

        # Weak/no login indicators
        weak_html = "<html><body>Some content</body></html>"
        result = detector.detect(weak_html)
        assert result.confidence < 0.5

    def test_extract_title_method(self, detector):
        """Test the title extraction method."""
        html = "<html><head><title>  Test Title  </title></head></html>"
        title = detector._extract_title(html)
        assert title == "Test Title"

    def test_empty_html(self, detector):
        """Test handling of empty HTML."""
        result = detector.detect("")
        assert result.is_login_page is False
        assert result.confidence == 0.0

    def test_multiple_indicators_boost_confidence(self, detector):
        """Test that multiple indicators increase confidence."""
        html = """
        <html>
        <head><title>Sign In</title></head>
        <body>
            <form action="/login" method="post">
                <input type="email" name="username" placeholder="Enter your username" />
                <input type="password" name="password" placeholder="Enter your password" />
                <button type="submit">Sign In</button>
            </form>
            <p>Forgot your password?</p>
            <p>Don't have an account? Sign up</p>
        </body>
        </html>
        """
        result = detector.detect(html, url="https://example.com/login")
        assert result.is_login_page is True
        assert len(result.indicators) >= 3  # Title, form, URL, text patterns
        assert result.confidence >= 0.8  # Multiple indicators = higher confidence


class TestIsLoginPageFunction:
    """Test cases for the is_login_page convenience function."""

    def test_returns_true_for_login_page(self):
        """Test that function returns True for login pages."""
        html = "<html><title>Sign In</title><body><input type='password' /></body></html>"
        assert is_login_page(html) is True

    def test_returns_false_for_normal_page(self):
        """Test that function returns False for normal pages."""
        html = "<html><title>Product Page</title><body><h1>Buy Now</h1></body></html>"
        assert is_login_page(html) is False

    def test_respects_confidence_threshold(self):
        """Test that confidence threshold parameter works."""
        # Strong login indicators should be detected even with high threshold
        html = "<html><head><title>Sign In</title></head><body><input type='password' /></body></html>"
        # High threshold should still detect (strong indicators)
        assert is_login_page(html, confidence_threshold=0.8) is True
        # Low threshold should detect
        assert is_login_page(html, confidence_threshold=0.3) is True
        
        # Non-login page should not be detected even with low threshold
        html_no_login = "<html><body>Some content</body></html>"
        assert is_login_page(html_no_login, confidence_threshold=0.1) is False
    def test_with_url_parameter(self):
        """Test URL parameter integration."""
        html = "<html><body>Some content</body></html>"
        # Should detect based on URL even with minimal HTML
        assert is_login_page(html, url="https://example.com/login") is True


class TestReportedBugCase:
    """Test the specific bug case reported by the user."""

    def test_petfoodex_login_bug(self):
        """Test the exact scenario from the bug report.

        The bug was that petfoodex returned a login page with title "Sign In"
        and the AI extracted this as product data with title "Sign In".
        """
        # Simulated HTML that would come from the login page
        login_page_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sign In</title>
        </head>
        <body>
            <div class="login-container">
                <h1>Sign In</h1>
                <form id="loginForm" action="/login" method="post">
                    <div class="form-group">
                        <label for="username">Username</label>
                        <input type="text" id="username" name="username" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    <button type="submit">Sign In</button>
                </form>
                <p><a href="/forgot-password">Forgot your password?</a></p>
            </div>
        </body>
        </html>
        """

        detector = LoginPageDetector()
        result = detector.detect(login_page_html, url="https://petfoodex.com/login")

        # Should be detected as login page
        assert result.is_login_page is True
        assert result.confidence >= 0.5

        # Should have detected specific indicators
        indicator_types = [ind.split(":")[0] for ind in result.indicators]
        assert "title" in indicator_types
        assert "login_form_elements" in indicator_types
        assert "url_path" in indicator_types

        # The convenience function should also detect it
        assert is_login_page(login_page_html, url="https://petfoodex.com/login") is True
