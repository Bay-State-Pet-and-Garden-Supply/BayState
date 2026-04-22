"""
Workflow executor for scraper automation using Playwright.

This module has been refactored to use extracted modules for better separation of concerns:
- BrowserManager: Browser lifecycle management
- SelectorResolver: Element finding and value extraction
- DebugArtifactCapture: Debug artifact capture
- NormalizationEngine: Result normalization
- StepExecutor: Step execution with retry logic
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
import logging
import inspect
import os
import threading
import time
from pathlib import Path
from typing import Any, cast

from core.adaptive_retry_strategy import AdaptiveRetryStrategy
from core.anti_detection_manager import AntiDetectionManager
from core.failure_analytics import FailureAnalytics
from core.failure_classifier import FailureClassifier, FailureType
from core.retry_executor import RetryExecutor, CircuitBreakerConfig
from core.settings_manager import SettingsManager

from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import (
    BrowserError,
    CircuitBreakerOpenError,
    ErrorContext,
    NoResultsError,
    NonRetryableError,
    PageNotFoundError,
    ScraperError,
    WorkflowExecutionError,
)
from scrapers.models.config import ScraperConfig, SelectorConfig, WorkflowStep

# Extracted modules
from scrapers.executor.selector_resolver import SelectorResolver
from scrapers.executor.debug_capture import DebugArtifactCapture
from scrapers.executor.normalization import NormalizationEngine
from scrapers.executor.step_executor import StepExecutor
from utils.scraping.browser_persistence import resolve_browser_state_location

logger = logging.getLogger(__name__)

# Constants
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class WorkflowExecutor:
    """Executes scraper workflows defined in YAML configurations using Playwright.

    AI/Agentic features are deprecated for static scrapers.
    Use AISearchScraper for AI-powered tasks.
    """

    def __init__(
        self,
        config: ScraperConfig,
        headless: bool = True,
        timeout: int | None = None,
        enable_retry: bool = False,
        max_retries: int | None = None,
        worker_id: str | None = None,
        stop_event: threading.Event | None = None,
        debug_mode: bool = False,
        job_id: str | None = None,
        event_emitter: Any | None = None,
        debug_callback: Any | None = None,
        api_client: Any | None = None,
    ) -> None:
        """
        Initialize the workflow executor.

        Args:
            config: ScraperConfig instance with workflow definition
            headless: Whether to run browser in headless mode
            timeout: Default timeout in seconds (overrides config timeout)
            enable_retry: Whether to enable retry logic for actions
            max_retries: Override default max retries (uses config.retries if None)
            worker_id: Optional identifier for the worker (used for profile isolation)
            stop_event: Optional threading.Event to check for cancellation
            api_client: Optional API client for credential resolution
        """
        self.config = config
        self.headless = headless
        self.enable_retry = enable_retry
        self.worker_id = worker_id
        self.stop_event = stop_event
        self.debug_mode = debug_mode
        self.job_id = job_id
        self.event_emitter = event_emitter
        self.debug_callback = debug_callback
        self.api_client = api_client
        self.credentials: dict[str, dict[str, str]] = {}
        self.settings = SettingsManager()
        self.scraper_type = "static"  # Force static type

        # Determine if running in CI environment
        self.is_ci: bool = os.getenv("CI") == "true"

        self.timeout = timeout or config.timeout

        # Increase timeout in CI environment for more reliable testing
        if self.is_ci:
            self.timeout = 60

        # Set max retries - default to 0 (no retries) for fast failure
        self.max_retries = max_retries if max_retries is not None else (config.retries if config.retries is not None else 0)

        self.browser: Any = None
        self.browser_state_key: str | None = None
        self.browser_state_path: str | None = None
        self.results: dict[str, Any] = {}
        self.context: dict[str, Any] = {}  # Store execution context
        # Data shared with extracted modules via context object
        self.context_data: dict[str, Any] = {"timeout_multiplier": 1.0}

        # Build selector lookup dictionaries (ID-based primary, name-based fallback)
        self.selectors_by_id: dict[str, SelectorConfig] = {s.id: s for s in config.selectors if s.id}
        self.selectors: dict[str, SelectorConfig] = {s.name: s for s in config.selectors}

        self.anti_detection_manager: AntiDetectionManager | None = None

        # Initialize adaptive retry strategy with history persistence
        history_path = os.path.join(PROJECT_ROOT, "data", f"retry_history_{config.name}.json")
        self.adaptive_retry_strategy = AdaptiveRetryStrategy(history_file=history_path)

        # Initialize failure classifier with site-specific patterns
        no_results_selectors = self.config.validation.no_results_selectors if self.config.validation else []
        no_results_text_patterns = self.config.validation.no_results_text_patterns if self.config.validation else []
        self.failure_classifier = FailureClassifier(
            site_specific_no_results_selectors=no_results_selectors,
            site_specific_no_results_text_patterns=no_results_text_patterns,
        )

        # Initialize failure analytics
        self.failure_analytics = FailureAnalytics()

        # Initialize retry executor with circuit breaker
        circuit_config = CircuitBreakerConfig(
            failure_threshold=5,
            success_threshold=2,
            timeout_seconds=60.0,
        )
        self.retry_executor = RetryExecutor(
            adaptive_strategy=self.adaptive_retry_strategy,
            failure_analytics=self.failure_analytics,
            failure_classifier=self.failure_classifier,
            circuit_breaker_config=circuit_config,
        )

        # Register recovery handlers
        self._register_recovery_handlers()

        # Initialize action registry with auto-discovery
        ActionRegistry.auto_discover_actions()

        # Track workflow state
        self.first_navigation_done = False
        self.workflow_stopped = False
        self.current_step_index = 0

        # Session management for login persistence
        self.session_authenticated = False
        self.session_auth_time: float | None = None
        self.session_timeout = 1800  # 30 minutes default session timeout

        # Error tracking for current workflow run
        self.step_errors: list[dict[str, Any]] = []

        # Extracted modules will be initialized in async initialize()
        self.selector_resolver: SelectorResolver | None = None
        self.debug_capture: DebugArtifactCapture | None = None
        self.normalization_engine: NormalizationEngine | None = None
        self.step_executor: StepExecutor | None = None

    @property
    def config_name(self) -> str:
        """Name of the scraper configuration."""
        return self.config.name

    async def initialize(self) -> None:
        """Initialize the browser and all extracted modules asynchronously."""
        self._bind_browser(await self._create_browser())

    async def _create_browser(self) -> Any:
        """Create and return a configured Playwright browser instance."""
        try:
            import uuid

            profile_suffix = f"workflow_{int(time.time())}_{uuid.uuid4().hex[:8]}"

            if self.config.requires_login():
                browser_state_location = resolve_browser_state_location(
                    self.config.name,
                    self.config.base_url,
                )
                self.browser_state_key = browser_state_location.key
                self.browser_state_path = browser_state_location.storage_state_path
                logger.info(
                    "Browser state persistence enabled for scraper %s (key=%s)",
                    self.config.name,
                    self.browser_state_key,
                )
            else:
                self.browser_state_key = None
                self.browser_state_path = None

            from utils.scraping.playwright_browser import create_playwright_browser

            logger.info(f"Initializing Playwright browser for scraper: {self.config.name}")
            browser = await create_playwright_browser(
                site_name=self.config.name,
                headless=self.headless,
                profile_suffix=profile_suffix,
                timeout=self.timeout,
                use_stealth=self.config.use_stealth,
                storage_state_path=self.browser_state_path,
            )

            logger.info(f"Browser initialized for scraper: {self.config.name}")
            return browser

        except Exception as e:
            logger.error(f"Failed to initialize browser: {e}")
            raise BrowserError(
                f"Failed to initialize browser: {e}",
                context=ErrorContext(site_name=self.config.name),
            )

    def _bind_browser(self, browser: Any) -> None:
        """Bind a browser instance to the executor runtime."""
        self.browser = browser

        try:
            setattr(self.browser, "context_data", self.context_data)
        except Exception:
            logger.debug("Failed to attach context_data to browser", exc_info=True)

        # Initialize anti-detection manager if configured
        if self.config.anti_detection:
            try:
                self.anti_detection_manager = AntiDetectionManager(self.browser, self.config.anti_detection, self.config.name)
                logger.info(f"Anti-detection manager initialized for scraper: {self.config.name}")
            except Exception as e:
                logger.warning(f"Failed to initialize anti-detection manager: {e}")
                self.anti_detection_manager = None
        else:
            self.anti_detection_manager = None

        # Initialize extracted modules
        self._init_extracted_modules()

    def _capture_runtime_state(self) -> dict[str, Any]:
        """Capture browser-bound runtime state for temporary context swapping."""
        return {
            "browser": self.browser,
            "anti_detection_manager": self.anti_detection_manager,
            "selector_resolver": self.selector_resolver,
            "debug_capture": self.debug_capture,
            "normalization_engine": self.normalization_engine,
            "step_executor": self.step_executor,
        }

    def _restore_runtime_state(self, runtime_state: dict[str, Any]) -> None:
        """Restore browser-bound runtime state after temporary context swapping."""
        self.browser = runtime_state["browser"]
        self.anti_detection_manager = runtime_state["anti_detection_manager"]
        self.selector_resolver = runtime_state["selector_resolver"]
        self.debug_capture = runtime_state["debug_capture"]
        self.normalization_engine = runtime_state["normalization_engine"]
        self.step_executor = runtime_state["step_executor"]

    def _clear_runtime_state(self) -> None:
        """Clear browser-bound runtime state after browser shutdown."""
        self.browser = None
        self.anti_detection_manager = None
        self.selector_resolver = None
        self.debug_capture = None
        self.normalization_engine = None
        self.step_executor = None

    async def collect_runtime_debug_context(
        self,
        *,
        include_page_source: bool = False,
        include_screenshot: bool = False,
    ) -> dict[str, Any]:
        """Collect a structured runtime snapshot for failure diagnostics."""

        snapshot: dict[str, Any] = {
            "scraper": self.config.name,
            "job_id": self.job_id,
            "sku": self.context.get("sku") if isinstance(self.context, dict) else None,
            "current_step_index": self.current_step_index,
            "requires_login": self.config.requires_login(),
            "session_authenticated": self.is_session_authenticated(),
            "credential_refs": list(self.config.credential_refs or []),
            "runtime_credential_refs": self._build_runtime_credential_refs(),
            "resolved_credentials": {
                ref: {
                    "source": value.get("_credential_source"),
                    "type": value.get("type"),
                    "has_username": bool(value.get("username")),
                    "has_password": bool(value.get("password")),
                    "has_api_key": bool(value.get("api_key")),
                }
                for ref, value in (self.credentials or {}).items()
                if isinstance(value, dict)
            },
            "storage_state": {
                "key": self.browser_state_key,
                "path": self.browser_state_path,
                "exists": bool(self.browser_state_path and Path(self.browser_state_path).is_file()),
            },
            "results_keys": sorted(self.results.keys()),
            "context_keys": sorted(self.context.keys()) if isinstance(self.context, dict) else [],
        }

        if self.browser and hasattr(self.browser, "get_debug_snapshot"):
            try:
                snapshot["browser"] = self.browser.get_debug_snapshot()
            except Exception as exc:
                snapshot["browser_snapshot_error"] = str(exc)

        page = getattr(self.browser, "page", None) if self.browser else None
        if page is not None:
            try:
                snapshot["page_url"] = page.url
            except Exception:
                pass
            try:
                snapshot["page_title"] = await page.title()
            except Exception:
                pass

            if include_page_source:
                try:
                    page_source = await page.content()
                    snapshot["page_source_length"] = len(page_source)
                    snapshot["page_source_preview"] = page_source[:4000]
                except Exception as exc:
                    snapshot["page_source_error"] = str(exc)

            if include_screenshot:
                try:
                    if self.debug_capture is not None:
                        screenshot_path = await self.debug_capture.save_screenshot(
                            page,
                            filename=f"login_failure_{self.config.name}_{int(time.time())}.png",
                        )
                        if screenshot_path:
                            snapshot["screenshot_path"] = screenshot_path
                except Exception as exc:
                    snapshot["screenshot_error"] = str(exc)

        return snapshot

    async def _close_browser(self, browser: Any) -> None:
        """Close a browser instance, supporting async and sync quit methods."""
        quit_method = getattr(browser, "quit", None)
        if not callable(quit_method):
            return

        quit_result = quit_method()
        if inspect.isawaitable(quit_result):
            await quit_result

    def _build_execution_context(
        self,
        context: dict[str, Any] | None = None,
        cohort_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build execution context for workflow steps and action handlers."""
        execution_context: dict[str, Any] = {}

        if cohort_context:
            execution_context.update(cohort_context)

        if context:
            execution_context.update(context)

        if cohort_context:
            execution_context["cohort_context"] = cohort_context.copy()

        execution_context["base_url"] = self.config.base_url
        execution_context["name"] = self.config.name
        execution_context["display_name"] = self.config.display_name
        return execution_context

    @asynccontextmanager
    async def browser_context(self) -> AsyncGenerator[Any, None]:
        """Create a shared browser session for cohort processing."""
        shared_browser = await self._create_browser()

        try:
            yield shared_browser
        finally:
            await self._close_browser(shared_browser)

    def _init_extracted_modules(self) -> None:
        """Initialize all extracted module instances."""
        self.selector_resolver = SelectorResolver(self.browser)
        self.debug_capture = DebugArtifactCapture(
            job_id=self.job_id,
            scraper_name=self.config.name,
            debug_mode=self.debug_mode,
            debug_callback=self.debug_callback,
        )
        self.normalization_engine = NormalizationEngine()
        self.step_executor = StepExecutor(
            config_name=self.config.name,
            browser=self.browser,
            retry_executor=self.retry_executor,
            enable_retry=self.enable_retry,
            max_retries=self.max_retries,
            stop_event=self.stop_event,
            debug_mode=self.debug_mode,
            debug_callback=self.debug_callback,
            context=self,
            event_emitter=self.event_emitter,
        )

    async def dispatch_step(self, step: WorkflowStep) -> Any:
        """Dispatch a workflow step for execution. Used by actions."""
        return await self._execute_step(step, self.context)

    def _register_recovery_handlers(self) -> None:
        """Register recovery handlers for different failure types."""
        import asyncio

        async def handle_captcha(context: ErrorContext) -> bool:
            logger.info("Attempting CAPTCHA recovery...")
            await asyncio.sleep(5)
            try:
                self.browser.page.reload()
                await asyncio.sleep(2)
                return True
            except Exception as e:
                logger.warning(f"CAPTCHA recovery failed: {e}")
                return False

        async def handle_rate_limit(context: ErrorContext) -> bool:
            logger.info("Handling rate limit - waiting 30 seconds...")
            await asyncio.sleep(30)
            return True

        async def handle_access_denied(context: ErrorContext) -> bool:
            logger.info("Attempting session rotation for access denied...")
            if self.anti_detection_manager:
                try:
                    self.browser.context.clear_cookies()
                    await asyncio.sleep(2)
                    return True
                except Exception as e:
                    logger.warning(f"Session rotation failed: {e}")
            return False

        retry_executor = cast(Any, self.retry_executor)
        retry_executor.register_recovery_handler(FailureType.CAPTCHA_DETECTED, handle_captcha)
        retry_executor.register_recovery_handler(FailureType.RATE_LIMITED, handle_rate_limit)
        retry_executor.register_recovery_handler(FailureType.ACCESS_DENIED, handle_access_denied)

    def _build_runtime_credential_refs(self) -> list[str]:
        refs: list[str] = []

        if self.config.requires_login() and self.config.name:
            refs.append(str(self.config.name).strip())

        refs.extend(
            str(ref).strip()
            for ref in (self.config.credential_refs or [])
            if str(ref).strip()
        )

        seen: set[str] = set()
        ordered_refs: list[str] = []
        for ref in refs:
            if ref in seen:
                continue
            seen.add(ref)
            ordered_refs.append(ref)

        return ordered_refs

    def _resolve_credential_refs(self) -> dict[str, dict[str, str]]:
        """Resolve credential_refs from config using the API client or environment variables."""
        runtime_credential_refs = self._build_runtime_credential_refs()
        logger.info(
            "[Credentials] Resolving runtime credential refs for %s: %s",
            self.config.name,
            runtime_credential_refs,
        )

        if not runtime_credential_refs:
            logger.info(
                "[Credentials] No runtime credential refs defined for %s",
                self.config.name,
            )
            return {}

        resolved: dict[str, dict[str, str]] = {}
        if self.api_client:
            logger.info(
                "[Credentials] Using API client to resolve %s runtime credential refs",
                len(runtime_credential_refs),
            )
            try:
                resolved = self.api_client.resolve_credentials(runtime_credential_refs)
            except Exception as e:
                logger.error(f"[Credentials] Failed to resolve credential_refs via API: {e}", exc_info=True)

        from core.api_client import ScraperAPIClient

        missing_refs = [ref for ref in runtime_credential_refs if ref not in resolved]
        if missing_refs:
            for ref in missing_refs:
                supabase_creds = ScraperAPIClient.get_credentials_from_supabase(ref)
                if supabase_creds:
                    resolved[ref] = supabase_creds
                    continue

                env_creds = ScraperAPIClient.get_credentials_from_env(ref)
                if env_creds:
                    resolved[ref] = env_creds

        if resolved:
            logger.info(
                "[Credentials] Resolved %s runtime credential refs for %s: %s",
                len(resolved),
                self.config.name,
                {
                    ref: str(creds.get("_credential_source") or "unknown")
                    for ref, creds in resolved.items()
                },
            )
        missing_refs = [ref for ref in runtime_credential_refs if ref not in resolved]
        if missing_refs:
            logger.warning(
                "[Credentials] Missing runtime credential refs for %s: %s",
                self.config.name,
                missing_refs,
            )
        elif not self.api_client:
            logger.info("[Credentials] Resolved runtime credential refs without an API client")
        return resolved

    async def execute_workflow(
        self,
        context: dict[str, Any] | None = None,
        quit_browser: bool = True,
        browser_context: Any | None = None,
        cohort_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute the complete workflow defined in the configuration."""
        runtime_state = self._capture_runtime_state()
        using_shared_browser = browser_context is not None

        try:
            total_steps = len(self.config.workflows)
            logger.info(f"Starting workflow execution for: {self.config.name} ({total_steps} steps)")

            if using_shared_browser:
                logger.info("Using shared browser context for scraper: %s", self.config.name)
                self._bind_browser(browser_context)
            elif self.browser is None or self.step_executor is None:
                await self.initialize()

            self.results = {}
            self.workflow_stopped = False
            self.step_errors = []
            self.current_step_index = 0

            # Resolve credential refs before execution.
            self.credentials = self._resolve_credential_refs()
            if self._build_runtime_credential_refs() and not self.credentials:
                logger.warning(f"Failed to resolve any runtime credential refs for {self.config.name}")

            if self.stop_event and self.stop_event.is_set():
                raise WorkflowExecutionError("Workflow cancelled", context=ErrorContext(site_name=self.config.name))

            if context:
                self.results.update(context)

            self.context = self._build_execution_context(context=context, cohort_context=cohort_context)

            for i, step in enumerate(self.config.workflows, 1):
                self.current_step_index = i
                if self.workflow_stopped:
                    break

                await self._execute_step_with_retry(step, self.context, step_index=i)

                # Sync extracted results back to context so subsequent steps
                # can reference them via {{variable}} substitution
                self.context.update(self.results)

                if self.workflow_stopped:
                    break

            self.apply_normalization()

            return {
                "success": True,
                "results": self.results,
                "config_name": self.config.name,
                "steps_executed": self.current_step_index,
                "total_steps": total_steps,
                "errors": self.step_errors,
                "image_quality": self.config.image_quality,
            }

        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            if isinstance(e, (WorkflowExecutionError, ScraperError)):
                raise
            raise WorkflowExecutionError(f"Workflow execution failed: {e}", context=ErrorContext(site_name=self.config.name))
        finally:
            if using_shared_browser:
                self._restore_runtime_state(runtime_state)
            elif quit_browser and self.browser:
                await self._close_browser(self.browser)
                self._clear_runtime_state()

    async def execute_steps(self, steps: list[Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute specific workflow steps."""
        try:
            for i, step in enumerate(steps, 1):
                if self.workflow_stopped:
                    break
                await self._execute_step_with_retry(step, self.context, step_index=i)

            return {
                "success": True,
                "results": self.results,
                "config_name": self.config.name,
                "steps_executed": len(steps),
            }
        except Exception as e:
            raise WorkflowExecutionError(f"Step execution failed: {e}", context=ErrorContext(site_name=self.config.name))

    async def _execute_step_with_retry(self, step: WorkflowStep, context: dict[str, Any] | None = None, step_index: int = 0) -> None:
        """Execute a workflow step with retry logic."""
        if self.step_executor is None:
            raise WorkflowExecutionError("Workflow executor not initialized")
        await self.step_executor.execute_step_with_retry(step, context, step_index)

    async def _execute_step(self, step: WorkflowStep, context: dict[str, Any] | None = None) -> Any:
        """Execute a single workflow step."""
        if self.step_executor is None:
            raise WorkflowExecutionError("Workflow executor not initialized")
        return await self.step_executor.execute_step(step, context or {}, self.results)

    async def find_element_safe(
        self,
        selector: str | SelectorConfig,
        required: bool = True,
        timeout: int | None = None,
    ) -> Any:
        if self.selector_resolver is None:
            raise WorkflowExecutionError("Workflow executor not initialized")

        if isinstance(selector, SelectorConfig):
            # Combine primary selector and fallback_selectors
            selectors = [selector.selector] + selector.fallback_selectors
            return await self.selector_resolver.find_element_safe(selectors, required, timeout)

        return await self.selector_resolver.find_element_safe(selector, required, timeout)

    async def find_elements_safe(self, selector: str | SelectorConfig, timeout: int | None = None) -> list[Any]:
        if self.selector_resolver is None:
            raise WorkflowExecutionError("Workflow executor not initialized")

        if isinstance(selector, SelectorConfig):
            # Combine primary selector and fallback_selectors
            selectors = [selector.selector] + selector.fallback_selectors
            return await self.selector_resolver.find_elements_safe(selectors, timeout)

        return await self.selector_resolver.find_elements_safe(selector, timeout)

    async def extract_value_from_element(self, element: Any, attribute: str | None = None) -> Any:
        if self.selector_resolver is None:
            raise WorkflowExecutionError("Workflow executor not initialized")
        return await self.selector_resolver.extract_value_from_element(element, attribute)

    def _extract_value_from_element(self, element: Any, attribute: str | None = None) -> Any:
        return self.extract_value_from_element(element, attribute)

    def get_results(self) -> dict[str, Any]:
        return self.results.copy()

    def resolve_selector(self, identifier: str) -> SelectorConfig | None:
        selector = self.selectors_by_id.get(identifier)
        if selector:
            return selector
        return self.selectors.get(identifier)

    def is_session_authenticated(self) -> bool:
        if not self.session_authenticated or self.session_auth_time is None:
            return False
        elapsed = time.time() - self.session_auth_time
        if elapsed > self.session_timeout:
            self.session_authenticated = False
            return False
        return True

    def mark_session_authenticated(self) -> None:
        self.session_authenticated = True
        self.session_auth_time = time.time()

    def reset_session(self) -> None:
        self.session_authenticated = False
        self.session_auth_time = None

    def apply_normalization(self) -> None:
        if not self.config.normalization or self.normalization_engine is None:
            return
        rule_dicts = [{"field": r.field, "action": r.action, "params": r.params} for r in self.config.normalization]
        self.normalization_engine.normalize_results(self.results, rule_dicts)
