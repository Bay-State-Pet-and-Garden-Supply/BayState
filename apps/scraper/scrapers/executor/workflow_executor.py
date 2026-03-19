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

import logging
import os
import inspect
import threading
import time
from typing import Any, cast

from core.adaptive_retry_strategy import AdaptiveRetryStrategy
from core.anti_detection_manager import AntiDetectionManager
from core.failure_analytics import FailureAnalytics
from core.failure_classifier import FailureClassifier, FailureType
from core.retry_executor import RetryExecutor, CircuitBreakerConfig
from core.settings_manager import SettingsManager

try:
    from scrapers.actions.registry import ActionRegistry
except ImportError:
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
from scrapers.executor.browser_manager import BrowserManager
from scrapers.executor.selector_resolver import SelectorResolver
from scrapers.executor.debug_capture import DebugArtifactCapture
from scrapers.executor.normalization import NormalizationEngine
from scrapers.executor.step_executor import StepExecutor

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
        self.scraper_type = "static" # Force static type

        # Determine if running in CI environment
        self.is_ci: bool = os.getenv("CI") == "true"

        self.timeout = timeout or config.timeout

        # Increase timeout in CI environment for more reliable testing
        if self.is_ci:
            self.timeout = 60

        # Set max retries - default to 0 (no retries) for fast failure
        self.max_retries = max_retries if max_retries is not None else (config.retries if config.retries is not None else 0)

        self.browser: Any = None
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
        try:
            import uuid
            profile_suffix = f"workflow_{int(time.time())}_{uuid.uuid4().hex[:8]}"

            from utils.scraping.playwright_browser import create_playwright_browser
            logger.info(f"Initializing Playwright browser for scraper: {self.config.name}")
            self.browser = await create_playwright_browser(
                site_name=self.config.name,
                headless=self.headless,
                profile_suffix=profile_suffix,
                timeout=self.timeout,
            )

            logger.info(f"Browser initialized for scraper: {self.config.name}")

        except Exception as e:
            logger.error(f"Failed to initialize browser: {e}")
            raise BrowserError(
                f"Failed to initialize browser: {e}",
                context=ErrorContext(site_name=self.config.name),
            )

        # Initialize anti-detection manager if configured
        if self.config.anti_detection:
            try:
                self.anti_detection_manager = AntiDetectionManager(self.browser, self.config.anti_detection, self.config.name)
                logger.info(f"Anti-detection manager initialized for scraper: {self.config.name}")
            except Exception as e:
                logger.warning(f"Failed to initialize anti-detection manager: {e}")
                self.anti_detection_manager = None

        # Initialize extracted modules
        self._init_extracted_modules()

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


    def _resolve_credential_refs(self) -> dict[str, dict[str, str]]:
        """Resolve credential_refs from config using the API client or environment variables."""
        if not self.config.credential_refs:
            return {}

        if self.api_client:
            try:
                resolved = self.api_client.resolve_credentials(self.config.credential_refs)
                if resolved:
                    logger.info(f"Resolved {len(resolved)} credential references for {self.config.name}")
                return resolved
            except Exception as e:
                logger.error(f"Failed to resolve credential_refs via API: {e}")

        # Fallback: resolve from environment variables
        from core.api_client import ScraperAPIClient
        resolved: dict[str, dict[str, str]] = {}
        for ref in self.config.credential_refs:
            env_creds = ScraperAPIClient.get_credentials_from_env(ref)
            if env_creds:
                resolved[ref] = env_creds
        if resolved:
            logger.info(f"Resolved {len(resolved)} credential references from environment for {self.config.name}")
        elif not self.api_client:
            logger.warning(f"Cannot resolve credential_refs: no API client and no env credentials")
        return resolved

    async def execute_workflow(self, context: dict[str, Any] | None = None, quit_browser: bool = True) -> dict[str, Any]:
        """Execute the complete workflow defined in the configuration."""
        try:
            total_steps = len(self.config.workflows)
            logger.info(f"Starting workflow execution for: {self.config.name} ({total_steps} steps)")

            self.results = {}
            self.workflow_stopped = False
            self.step_errors = []
            self.current_step_index = 0

            # Resolve credential_refs before execution
            self.credentials = self._resolve_credential_refs()
            if self.config.credential_refs and not self.credentials:
                logger.warning(f"Failed to resolve any credential_refs for {self.config.name}")

            if self.stop_event and self.stop_event.is_set():
                raise WorkflowExecutionError("Workflow cancelled", context=ErrorContext(site_name=self.config.name))

            if context:
                self.context = context.copy()
                self.results.update(context)
            else:
                self.context = {}

            # Add config variables to context for template substitution
            self.context["base_url"] = self.config.base_url
            self.context["name"] = self.config.name
            self.context["display_name"] = self.config.display_name

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
            if quit_browser and self.browser:
                self.browser.quit()

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
