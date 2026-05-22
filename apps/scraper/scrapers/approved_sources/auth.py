"""Login Automation for Approved Source Extraction.

Provides Crawl4AI-based login automation for auth-gated distributor portals.
Uses Crawl4AI's js_code and session_id features to fill login forms and
maintain authenticated sessions across multiple UPC lookups.

Logged-in sessions are cached process-locally with TTL to avoid redundant
logins. Concurrent login attempts for the same source/credential pair are
serialized via per-key async locks.

Never logs passwords or raw credential values. Diagnostics use
redacted_usernames and [REDACTED] password placeholders.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# =============================================================================
# Login config types
# =============================================================================


@dataclass
class LoginAutomationConfig:
    """Configuration for automating login to a distributor portal.

    All selector values are CSS selectors (or XPath as string) matching the
    legacy YAML login blocks from the original Playwright-based scrapers.
    """

    login_url: str
    username_selector: str
    password_selector: str
    submit_selector: str
    success_indicator: str  # CSS selector that appears after successful login
    failure_indicators: list[str] = field(default_factory=list)  # CSS selectors for login errors
    credential_ref: str = ""
    timeout_seconds: int = 30
    check_interval_seconds: float = 1.0


@dataclass
class LoginResult:
    """Result of a login attempt."""

    success: bool = False
    session_id: str | None = None
    failure_type: str | None = None  # AUTH_FAILED | AUTH_EXPIRED | AUTH_REQUIRED
    error_message: str | None = None
    redirected_url: str | None = None


@dataclass
class AuthenticatedSessionState:
    """Runtime state for an authenticated session."""

    session_id: str
    source_slug: str
    credential_ref: str
    logged_in_at: float
    expires_at: float


# =============================================================================
# Per-distributor login configs (derived from legacy YAML login blocks)
# =============================================================================

ORGILL_LOGIN = LoginAutomationConfig(
    login_url="https://www.orgill.com/index.aspx?tab=8",
    username_selector="#cphMainContent_ctl00_loginOrgillxs_UserName",
    password_selector="#cphMainContent_ctl00_loginOrgillxs_Password",
    submit_selector="#cphMainContent_ctl00_loginOrgillxs_LoginButton",
    success_indicator="#btnMyProfile",
    failure_indicators=[
        "#cphMainContent_ctl00_loginOrgillxs_FailureText",
        ".validation-summary-errors",
    ],
    credential_ref="orgill",
    timeout_seconds=60,
)

PHILLIPS_LOGIN = LoginAutomationConfig(
    login_url="https://shop.phillipspet.com/ccrz__CCSiteLogin",
    username_selector="#emailField",
    password_selector="#passwordField",
    submit_selector="#send2Dsk",
    success_indicator="a.doLogout.cc_do_logout",
    failure_indicators=[
        ".cc-error-message",
        ".login-error",
    ],
    credential_ref="phillips",
    timeout_seconds=60,
)

PFE_LOGIN = LoginAutomationConfig(
    login_url="https://orders.petfoodexperts.com/SignIn",
    username_selector="#userName",
    password_selector="#password",
    submit_selector="button[data-test-selector='signIn_submit']",
    success_indicator="[data-test-selector='header_userName']",
    failure_indicators=[
        "[data-test-selector='signIn_error']",
    ],
    credential_ref="petfoodex",
    timeout_seconds=30,
)

# Map from credential_ref/source_slug to login config
LOGIN_CONFIG_MAP: dict[str, LoginAutomationConfig] = {
    "orgill": ORGILL_LOGIN,
    "phillips": PHILLIPS_LOGIN,
    "petfoodex": PFE_LOGIN,
}

_CREDENTIAL_REF_ALIASES: dict[str, str] = {
    "orgill": "orgill",
    "orgill_crawl4ai": "orgill",
    "phillips": "phillips",
    "phillips_crawl4ai": "phillips",
    "petfoodex": "petfoodex",
    "pet_food_experts": "petfoodex",
    "pet-food-experts": "petfoodex",
    "pet_food_experts_crawl4ai": "petfoodex",
}


def canonicalize_credential_ref(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    return _CREDENTIAL_REF_ALIASES.get(normalized, normalized)


def get_login_config(source_slug: str) -> LoginAutomationConfig | None:
    """Get login config for a distributor by slug or credential ref."""
    resolved = canonicalize_credential_ref(source_slug)
    if not resolved:
        return None
    return LOGIN_CONFIG_MAP.get(resolved)


# =============================================================================
# Credential resolution
# =============================================================================


def _redact_username(username: str) -> str:
    """Redact a username for safe logging.

    Shows first 2 chars and last 1 char, masking the rest.
    E.g., "john.doe@example.com" -> "joXXXXXXXXXXXXXXXXom"
    """
    if not username:
        return "[EMPTY]"
    if len(username) <= 4:
        return username[0] + "*" * (len(username) - 1)
    return username[:2] + "*" * (len(username) - 3) + username[-1]


def resolve_credentials(
    source_slug: str,
    api_client: Any | None,
    credential_ref: str | None = None,
) -> tuple[str, str] | None:
    """Resolve username/password credentials for a distributor.

    Uses api_client.get_credentials() (synchronous) or falls back
    to environment variables: {SLUG_UPPER}_USERNAME / PASSWORD.

    Returns (username, password) tuple or None if not found.
    NEVER logs the raw password.
    """
    ref = canonicalize_credential_ref(credential_ref or source_slug) or (credential_ref or source_slug)

    # Try api_client first
    if api_client and hasattr(api_client, "get_credentials"):
        try:
            creds = api_client.get_credentials(ref)
            if creds:
                username = creds.get("username") or creds.get("login") or ""
                password = creds.get("password") or creds.get("pass") or ""
                if username and password:
                    logger.debug(
                        "[Auth] Resolved credentials for %s (username: %s)",
                        ref,
                        _redact_username(username),
                    )
                    return (username, password)
        except Exception as e:
            logger.warning("[Auth] Error resolving credentials for %s: %s", ref, e)

    # Fallback: environment variables
    env_prefix = ref.upper().replace("-", "_")
    username = os.getenv(f"{env_prefix}_USERNAME", "")
    password = os.getenv(f"{env_prefix}_PASSWORD", "")
    if username and password:
        logger.debug(
            "[Auth] Resolved credentials from env for %s (username: %s)",
            ref,
            _redact_username(username),
        )
        return (username, password)

    logger.debug("[Auth] No credentials found for %s", ref)
    return None


# =============================================================================
# Session cache
# =============================================================================


class ApprovedSourceLoginManager:
    """Manages authenticated sessions for approved source distributors.

    Features:
    - Process-local session cache keyed by (source_slug, credential_ref)
    - Per-key async lock for concurrent login serialization
    - Session TTL with configurable expiry
    - Crawl4AI js_code-based form filling (no Playwright/Selenium)
    - NEVER logs passwords or raw credential values

    Usage:
        manager = ApprovedSourceLoginManager()
        result = await manager.ensure_logged_in("orgill", ORGILL_LOGIN, api_client)
        if result.success:
            config = manager.get_authenticated_crawl_config(result.session_id)
            # => CrawlerRunConfig with session_id
    """

    # Default session TTL: session cookies typically last 20-30 min on distributor portals
    DEFAULT_SESSION_TTL_SECONDS: int = 900  # 15 minutes

    def __init__(self, session_ttl_seconds: int | None = None):
        self._session_cache: dict[str, AuthenticatedSessionState] = {}
        self._session_locks: dict[str, asyncio.Lock] = {}
        self._session_ttl = session_ttl_seconds or self.DEFAULT_SESSION_TTL_SECONDS
        self._engine: Any = None  # Lazy-initialized Crawl4AIEngine
        self._session_cookies: dict[str, dict[str, str]] = {}  # session_id -> cookie_dict
        self._playwright: Any = None  # Lazy-initialized Playwright
        self._playwright_browser: Any = None  # Lazy-initialized Playwright browser
        self._auth_pages: dict[str, Any] = {}  # session_id -> Playwright page (legacy, unused)
        self._auth_contexts: dict[str, Any] = {}  # session_id -> Playwright BrowserContext

    def _store_cookies(self, session_id: str, cookies: dict[str, str]) -> None:
        """Store cookies for an authenticated session."""
        self._session_cookies[session_id] = cookies

    def _get_cookies(self, session_id: str) -> dict[str, str] | None:
        """Get stored cookies for an authenticated session."""
        return self._session_cookies.get(session_id)

    def _cache_key(self, source_slug: str, credential_ref: str | None) -> str:
        """Derive a stable cache key from source slug and credential ref."""
        ref = credential_ref or source_slug
        raw = f"{source_slug}:{ref}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _get_stable_session_id(self, source_slug: str, credential_ref: str | None) -> str:
        """Derive a stable session ID for a source/credential pair.

        Session IDs must be stable across calls so that authenticated crawl
        requests reuse the same browser session.
        """
        ref = credential_ref or source_slug
        raw = f"auth_{source_slug}_{ref}"
        return f"session_{hashlib.sha256(raw.encode()).hexdigest()[:12]}"

    def _get_lock(self, source_slug: str, credential_ref: str | None) -> asyncio.Lock:
        """Get or create a per-key lock."""
        key = self._cache_key(source_slug, credential_ref)
        if key not in self._session_locks:
            self._session_locks[key] = asyncio.Lock()
        return self._session_locks[key]

    def _get_cached_session(
        self, source_slug: str, credential_ref: str | None
    ) -> AuthenticatedSessionState | None:
        """Get a cached valid session for a source, or None if expired/missing."""
        key = self._cache_key(source_slug, credential_ref)
        state = self._session_cache.get(key)
        if state is None:
            return None
        if time.time() >= state.expires_at:
            logger.info("[Auth] Session expired for %s (source: %s)", credential_ref, source_slug)
            del self._session_cache[key]
            return None
        return state

    def _store_session(self, state: AuthenticatedSessionState) -> None:
        """Store an authenticated session in the cache."""
        key = self._cache_key(state.source_slug, state.credential_ref)
        self._session_cache[key] = state
        logger.info(
            "[Auth] Session stored for %s (source: %s, session: %s, expires in %ds)",
            state.credential_ref,
            state.source_slug,
            state.session_id[:16],
            int(state.expires_at - time.time()),
        )

    async def _initialize_engine(self) -> Any:
        """Lazy-initialize the Crawl4AI engine for login automation.

        Returns the engine instance (or None if crawl4ai is not available).
        """
        if self._engine is not None:
            return self._engine

        try:
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            config = {
                "browser": {
                    "headless": True,
                    "viewport_width": 1280,
                    "viewport_height": 800,
                    "java_script_enabled": True,
                    "enable_stealth": True,
                    "text_mode": False,
                    "light_mode": True,
                    "extra_args": ["--disable-gpu", "--no-sandbox"],
                },
                "crawler": {
                    "page_timeout": 60000,
                    "delay_before_return_html": 1000,
                    "remove_overlay_elements": True,
                    "simulate_user": False,
                    "magic": False,
                },
            }
            self._engine = Crawl4AIEngine(config)
            await self._engine.initialize()
            logger.info("[Auth] Crawl4AI engine initialized for login automation")
            return self._engine
        except Exception as e:
            logger.warning("[Auth] Failed to initialize Crawl4AI engine: %s", e)
            return None

    async def _generate_login_js_code(
        self,
        login_config: LoginAutomationConfig,
        username: str,
        password: str,
    ) -> str:
        """Generate js_code for filling the login form.

        Returns JavaScript that:
        1. Fills the username field
        2. Fills the password field
        3. Clicks the submit button
        4. Waits briefly for navigation

        The JavaScript is generated dynamically with the actual credential
        values embedded as JS strings. The values are NOT logged anywhere.
        """
        # Escape single quotes and backslashes for JS string safety
        def _js_escape(s: str) -> str:
            return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")

        safe_username = _js_escape(username)
        safe_password = _js_escape(password)

        js_code = f"""
        (async () => {{
            const usernameField = document.querySelector('{login_config.username_selector}');
            const passwordField = document.querySelector('{login_config.password_selector}');
            const submitButton = document.querySelector('{login_config.submit_selector}');

            if (!usernameField || !passwordField) {{
                console.error('Login form fields not found');
                return;
            }}

            // Fill fields
            usernameField.value = '';
            usernameField.focus();
            usernameField.value = '{safe_username}';
            usernameField.dispatchEvent(new Event('input', {{ bubbles: true }}));
            usernameField.dispatchEvent(new Event('change', {{ bubbles: true }}));

            passwordField.value = '';
            passwordField.focus();
            passwordField.value = '{safe_password}';
            passwordField.dispatchEvent(new Event('input', {{ bubbles: true }}));
            passwordField.dispatchEvent(new Event('change', {{ bubbles: true }}));

            // Small delay before submit
            await new Promise(r => setTimeout(r, 200));

            // Click submit
            if (submitButton) {{
                submitButton.click();
            }} else {{
                // Try pressing Enter in password field
                passwordField.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }}));
                passwordField.dispatchEvent(new KeyboardEvent('keyup', {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }}));
            }}

            // Wait for navigation/response
            await new Promise(r => setTimeout(r, 3000));
        }})();
        """
        return js_code.strip()

    def _check_login_success(self, html: str, login_config: LoginAutomationConfig) -> bool:
        """Check if the login was successful by looking for success indicators."""
        if not html or not login_config.success_indicator:
            return False

        # Simple substring check for success indicator in HTML
        # The success_indicator is typically a CSS selector for an element
        # that appears only when logged in
        success_marker = login_config.success_indicator

        # Strip CSS selector prefixes/suffixes for simple checking
        simple_marker = success_marker.strip("#.")
        if simple_marker and simple_marker in html:
            return True

        return False

    def _check_login_failure(self, html: str, login_config: LoginAutomationConfig) -> str | None:
        """Check if the login failed by looking for failure indicators.

        Returns the matched failure indicator text or None.
        """
        if not html:
            return None

        for indicator in login_config.failure_indicators:
            simple = indicator.strip("#.")
            if simple and simple in html:
                return indicator
            # Also check for common error text patterns
            for text in [
                "invalid username or password",
                "login failed",
                "incorrect email or password",
                "sign in was unsuccessful",
            ]:
                if text in html.lower():
                    return text

        return None

    async def _ensure_playwright_browser(self):
        """Lazy-initialize Playwright and browser for persistent use."""
        if self._playwright is None or self._playwright_browser is None:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().__aenter__()
            self._playwright_browser = await self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"],
            )
        return self._playwright_browser

    def get_session_page(self, session_id: str) -> Any | None:
        """Get the authenticated Playwright page for a session (Legacy, returns None).
        
        Use create_session_page(session_id) asynchronously instead.
        """
        return None

    async def create_session_page(self, session_id: str) -> Any | None:
        """Create a new Playwright page inside the authenticated context."""
        if session_id not in self._auth_contexts:
            logger.warning("[Auth] No authenticated context for session %s", session_id[:12])
            return None
        context = self._auth_contexts[session_id]
        try:
            page = await context.new_page()
            return page
        except Exception as e:
            logger.error("[Auth] Failed to create new page in context: %s", e)
            return None

    async def fetch_authenticated_html(
        self, session_id: str, url: str
    ) -> str | None:
        """Fetch HTML using an authenticated Playwright session.

        Creates a new page in the cached context, navigates, and returns HTML.
        """
        if session_id not in self._auth_contexts:
            logger.warning("[Auth] No authenticated context for session %s", session_id[:12])
            return None

        context = self._auth_contexts[session_id]
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            html = await page.content()
            return html
        except Exception as e:
            logger.error("[Auth] Authenticated fetch failed for %s: %s", url, e)
            return None
        finally:
            await page.close()

    async def _crawl_for_login(
        self,
        login_config: LoginAutomationConfig,
        username: str,
        password: str,
        session_id: str,
    ) -> LoginResult:
        """Perform a login attempt using Playwright for reliable form interaction.

        Uses Playwright (not Crawl4AI js_code) to:
        1. Create a new BrowserContext
        2. Navigate a new page to the login URL
        3. Wait for the username/password selectors (handles JS-rendered forms)
        4. Fill the form fields
        5. Click the submit button
        6. Wait for the success indicator or detect failure

        After successful login, the Playwright context is kept alive in
        self._auth_contexts for subsequent authenticated fetches.
        """
        try:
            browser = await self._ensure_playwright_browser()
        except Exception as e:
            return LoginResult(
                success=False,
                failure_type="AUTH_FAILED",
                error_message=f"Playwright not available: {e}",
            )

        logger.info(
            "[Auth] Attempting login for %s with Playwright (session: %s...)",
            login_config.credential_ref,
            session_id[:12],
        )

        context = await browser.new_context()
        page = await context.new_page()
        page.set_default_timeout(login_config.timeout_seconds * 1000)

        final_url = login_config.login_url
        try:
            # Navigate to login page
            await page.goto(
                login_config.login_url,
                wait_until="domcontentloaded",
                timeout=login_config.timeout_seconds * 1000,
            )

            # Wait for the username field to appear (handles JS-rendered forms)
            try:
                await page.wait_for_selector(
                    login_config.username_selector,
                    timeout=login_config.timeout_seconds * 1000,
                )
            except Exception:
                await page.close()
                await context.close()
                return LoginResult(
                    success=False,
                    failure_type="AUTH_FAILED",
                    error_message=(
                        f"Login form not found: {login_config.username_selector} "
                        f"not found on {login_config.login_url}"
                    ),
                    redirected_url=page.url,
                )

            # Fill form fields
            await page.fill(login_config.username_selector, username)
            await page.fill(login_config.password_selector, password)

            # Click submit and wait for navigation
            try:
                async with page.expect_navigation(
                    timeout=login_config.timeout_seconds * 1000,
                    wait_until="domcontentloaded",
                ):
                    await page.click(login_config.submit_selector)
                final_url = page.url
            except Exception:
                pass

            # Wait a bit for the page to settle
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass

            # Check for success indicator
            try:
                await page.wait_for_selector(
                    login_config.success_indicator,
                    timeout=5000,
                )
                # Login succeeded! Keep context alive for authenticated fetches
                self._auth_contexts[session_id] = context

                logger.info(
                    "[Auth] Login successful for %s (context kept alive)",
                    login_config.credential_ref,
                )
                # Close the login page to free up resources
                await page.close()

                return LoginResult(
                    success=True,
                    session_id=session_id,
                    redirected_url=final_url,
                )
            except Exception:
                # Success indicator not found
                html = await page.content()
                failure_reason = self._check_login_failure(html, login_config)
                await page.close()
                await context.close()
                if failure_reason:
                    logger.warning(
                        "[Auth] Login failed for %s: %s",
                        login_config.credential_ref,
                        failure_reason,
                    )
                    return LoginResult(
                        success=False,
                        session_id=session_id,
                        failure_type="AUTH_FAILED",
                        error_message=f"Login failed: {failure_reason}",
                        redirected_url=final_url,
                    )

                return LoginResult(
                    success=False,
                    session_id=session_id,
                    failure_type="AUTH_FAILED",
                    error_message=(
                        f"Login attempt returned unknown state on {final_url}"
                    ),
                    redirected_url=final_url,
                )

        except Exception as e:
            await page.close()
            await context.close()
            logger.error(
                "[Auth] Login error for %s: %s",
                login_config.credential_ref,
                e,
            )
            return LoginResult(
                success=False,
                failure_type="AUTH_FAILED",
                error_message=f"Login exception: {e}",
                redirected_url=final_url,
            )

    async def ensure_logged_in(
        self,
        source_slug: str,
        login_config: LoginAutomationConfig | None = None,
        api_client: Any | None = None,
        credential_ref: str | None = None,
    ) -> LoginResult:
        """Ensure a valid authenticated session exists for a source.

        Returns cached session if still valid. Otherwise performs login.

        Args:
            source_slug: Adapter source slug (e.g., "orgill", "phillips").
            login_config: Login config for the source. If None, looked up by slug.
            api_client: Optional API client for credential resolution.
            credential_ref: Optional credential ref override.

        Returns:
            LoginResult with success flag and session_id.
        """
        ref = credential_ref or source_slug

        # Get login config if not provided
        if login_config is None:
            login_config = get_login_config(source_slug)
        if login_config is None:
            return LoginResult(
                success=False,
                failure_type="AUTH_REQUIRED",
                error_message=f"No login config for source: {source_slug}",
            )

        # Check cached session
        cached = self._get_cached_session(source_slug, ref)
        if cached is not None:
            logger.info(
                "[Auth] Reusing cached session for %s (source: %s, session: %s)",
                ref,
                source_slug,
                cached.session_id[:16],
            )
            return LoginResult(
                success=True,
                session_id=cached.session_id,
            )

        # Serialize concurrent login attempts with per-key lock
        lock = self._get_lock(source_slug, ref)
        async with lock:
            # Double-check after acquiring lock
            cached = self._get_cached_session(source_slug, ref)
            if cached is not None:
                return LoginResult(
                    success=True,
                    session_id=cached.session_id,
                )

            # Resolve credentials
            creds = resolve_credentials(source_slug, api_client, ref)
            if creds is None:
                return LoginResult(
                    success=False,
                    failure_type="AUTH_REQUIRED",
                    error_message=(
                        f"AUTH_REQUIRED: Authentication required for {source_slug}: "
                        f"no credentials found for '{ref}'"
                    ),
                )

            username, password = creds
            session_id = self._get_stable_session_id(source_slug, ref)

            # Perform login
            login_result = await self._crawl_for_login(
                login_config=login_config,
                username=username,
                password=password,
                session_id=session_id,
            )

            # Clear password from memory (username may stay for logging)
            password = ""

            if login_result.success:
                # Store in session cache
                state = AuthenticatedSessionState(
                    session_id=session_id,
                    source_slug=source_slug,
                    credential_ref=ref,
                    logged_in_at=time.time(),
                    expires_at=time.time() + self._session_ttl,
                )
                self._store_session(state)
            else:
                logger.warning(
                    "[Auth] Login failed for %s: %s",
                    ref,
                    login_result.error_message,
                )

            return login_result

    def get_authenticated_crawl_config(self, session_id: str) -> dict[str, Any]:
        """Get Crawl4AI config overrides for authenticated crawling.

        Returns a dict that should be merged into the engine/crawler config
        to reuse an authenticated browser session.

        Args:
            session_id: The session ID from ensure_logged_in().
        """
        return {
            "session_id": session_id,
            "use_persistent_context": False,  # Use in-memory by default
        }

    async def cleanup(self) -> None:
        """Clean up all resources: Crawl4AI engine, Playwright browser, sessions."""
        if self._engine is not None:
            try:
                await self._engine.cleanup()
            except Exception as e:
                logger.warning("[Auth] Error cleaning up engine: %s", e)
            self._engine = None

        # Close Playwright auth contexts
        for session_id, context in self._auth_contexts.items():
            try:
                await context.close()
            except Exception:
                pass
        self._auth_contexts.clear()
        self._auth_pages.clear()

        # Close Playwright browser
        if self._playwright_browser is not None:
            try:
                await self._playwright_browser.close()
            except Exception as e:
                logger.warning("[Auth] Error closing Playwright browser: %s", e)
            self._playwright_browser = None

        # Close Playwright
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception as e:
                logger.warning("[Auth] Error stopping Playwright: %s", e)
            self._playwright = None

        self._session_cache.clear()
        self._session_cookies.clear()


# Module-level singleton for reuse across adapters
_default_login_manager: ApprovedSourceLoginManager | None = None


def get_default_login_manager(
    session_ttl_seconds: int | None = None,
) -> ApprovedSourceLoginManager:
    """Get or create the default login manager singleton."""
    global _default_login_manager
    if _default_login_manager is None:
        _default_login_manager = ApprovedSourceLoginManager(
            session_ttl_seconds=session_ttl_seconds,
        )
    return _default_login_manager
