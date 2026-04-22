from __future__ import annotations

import asyncio
import logging
from typing import Any, cast

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import AuthenticationError, ErrorContext, WorkflowExecutionError

logger = logging.getLogger(__name__)


def _normalize_string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        candidate = value.strip()
        return [candidate] if candidate else []

    if isinstance(value, (list, tuple, set)):
        normalized: list[str] = []
        for item in value:
            candidate = str(item).strip()
            if candidate:
                normalized.append(candidate)
        return normalized

    return []


@ActionRegistry.register("login")
class LoginAction(BaseAction):
    """Action to execute login workflow with session persistence."""

    async def execute(self, params: dict[str, Any]) -> None:
        from scrapers.models.config import WorkflowStep

        scraper_name = self.ctx.config.name
        sku = self._current_sku()
        runtime_context = getattr(self.ctx, "context", {}) or {}
        test_mode = bool(runtime_context.get("test_mode")) if isinstance(runtime_context, dict) else False
        login_params = dict(params)
        login_config = getattr(self.ctx.config, "login", None)
        if login_config is not None and hasattr(login_config, "model_dump"):
            for key, value in login_config.model_dump().items():
                login_params.setdefault(key, value)

        if self.ctx.is_session_authenticated():
            if not test_mode:
                self._log_login(
                    logging.INFO,
                    f"Skipping login for {scraper_name} - session already authenticated",
                    sku=sku,
                )
                return
            self._log_login(
                logging.INFO,
                f"Session already authenticated for {scraper_name}; continuing login selector verification in test mode",
                sku=sku,
            )

        current_step: dict[str, str] = {"name": "resolve_credentials"}
        credential_resolution = self._resolve_login_credentials(login_params, scraper_name)
        login_url = str(login_params.get("url") or "").strip()
        username = str(login_params.get("username") or "").strip()
        password = str(login_params.get("password") or "").strip()
        success_indicator = str(login_params.get("success_indicator") or "").strip()

        self._log_login(
            logging.INFO,
            f"Preparing login workflow for {scraper_name}",
            sku=sku,
            details={
                "login_url": login_url,
                "test_mode": test_mode,
                "already_authenticated": self.ctx.is_session_authenticated(),
                "credential_resolution": credential_resolution,
            },
        )

        try:
            if not login_url:
                raise WorkflowExecutionError("Login config is missing a login URL")

            if not username or not password:
                attempted_refs = credential_resolution.get("candidate_refs", [])
                available_refs = credential_resolution.get("available_resolved_refs", [])
                raise AuthenticationError(
                    "Missing login credentials. "
                    + f"Tried refs: {attempted_refs or ['<none>']}. "
                    + f"Resolved refs available: {available_refs or ['<none>']}."
                )

            current_step = {"name": "navigate_login", "selector": login_url}
            self._log_login(
                logging.INFO,
                f"Navigating to login page for {scraper_name}",
                sku=sku,
                details={"url": login_url},
            )
            await self.ctx._execute_step(WorkflowStep(action="navigate", params={"url": login_url}))

            if test_mode:
                await self._validate_login_selectors(login_params)

            if success_indicator:
                current_step = {
                    "name": "check_existing_authenticated_session",
                    "selector": success_indicator,
                }
                try:
                    await self.ctx._execute_step(
                        WorkflowStep(
                            action="wait_for",
                            params={"selector": success_indicator, "timeout": 5},
                        )
                    )
                    self._log_login(
                        logging.INFO,
                        f"Existing authenticated session detected for {scraper_name}",
                        sku=sku,
                        details={"success_indicator": success_indicator},
                    )
                    if test_mode and self.ctx.event_emitter:
                        self.ctx.event_emitter.login_selector_status(
                            scraper=scraper_name,
                            selector_name="success_indicator",
                            status="FOUND",
                        )
                        for field in ["username_field", "password_field", "submit_button"]:
                            if login_params.get(field):
                                self.ctx.event_emitter.login_selector_status(
                                    scraper=scraper_name,
                                    selector_name=field,
                                    status="SKIPPED",
                                )
                    return
                except Exception:
                    self._log_login(
                        logging.INFO,
                        f"No existing authenticated session detected for {scraper_name}",
                        sku=sku,
                        details={"success_indicator": success_indicator},
                    )

            username_field = str(login_params.get("username_field") or "").strip()
            if username_field:
                current_step = {"name": "wait_for_username_field", "selector": username_field}
                await self.ctx._execute_step(
                    WorkflowStep(
                        action="wait_for",
                        params={"selector": username_field, "timeout": 15},
                    )
                )
                current_step = {"name": "input_username", "selector": username_field}
                self._log_login(
                    logging.INFO,
                    f"Populating username field for {scraper_name}",
                    sku=sku,
                    details={"selector": username_field},
                )
                await self.ctx._execute_step(
                    WorkflowStep(
                        action="input_text",
                        params={"selector": username_field, "text": username},
                    )
                )

            password_field = str(login_params.get("password_field") or "").strip()
            if password_field:
                current_step = {"name": "input_password", "selector": password_field}
                self._log_login(
                    logging.INFO,
                    f"Populating password field for {scraper_name}",
                    sku=sku,
                    details={"selector": password_field},
                )
                await self.ctx._execute_step(
                    WorkflowStep(
                        action="input_text",
                        params={"selector": password_field, "text": password},
                    )
                )

            submit_button = str(login_params.get("submit_button") or "").strip()
            if submit_button:
                current_step = {"name": "submit_login", "selector": submit_button}
                self._log_login(
                    logging.INFO,
                    f"Submitting login form for {scraper_name}",
                    sku=sku,
                    details={"selector": submit_button},
                )
                await self.ctx._execute_step(
                    WorkflowStep(action="click", params={"selector": submit_button})
                )

            timeout = int(login_params.get("timeout") or 30)
            if success_indicator:
                current_step = {
                    "name": "wait_for_success_indicator",
                    "selector": success_indicator,
                }
                self._log_login(
                    logging.INFO,
                    f"Waiting for login success indicator for {scraper_name}",
                    sku=sku,
                    details={"selector": success_indicator, "timeout": timeout},
                )
                await self.ctx._execute_step(
                    WorkflowStep(
                        action="wait_for",
                        params={"selector": success_indicator, "timeout": timeout},
                    )
                )
            else:
                self._log_login(
                    logging.WARNING,
                    f"No success indicator configured for {scraper_name}; marking session authenticated after submit",
                    sku=sku,
                )

            if test_mode and success_indicator:
                logger.info("[LOGIN_SELECTOR] success_indicator: 'FOUND'")

            self.ctx.mark_session_authenticated()
            self._log_login(
                logging.INFO,
                f"Login successful for {scraper_name}",
                sku=sku,
                details={
                    "success_indicator": success_indicator or None,
                    "credential_source": credential_resolution.get("credential_source"),
                    "credential_ref": credential_resolution.get("credential_ref"),
                },
            )
        except Exception as exc:
            failure_details = await self._collect_login_failure_details(
                login_params=login_params,
                credential_resolution=credential_resolution,
                current_step=current_step,
                error=exc,
                sku=sku,
            )
            failure_reason = self._build_failure_reason(
                error=exc,
                failure_details=failure_details,
                current_step=current_step,
            )
            self._log_login(
                logging.ERROR,
                f"Login failed for {scraper_name}: {failure_reason}",
                sku=sku,
                details=failure_details,
                flush_immediately=True,
            )

            error_context = ErrorContext(
                site_name=scraper_name,
                action="login",
                selector=current_step.get("selector"),
                url=login_url or None,
                sku=sku,
                extra={"login_failure": failure_details},
            )
            if isinstance(exc, AuthenticationError) or failure_details.get("category") == "authentication":
                raise AuthenticationError(
                    f"Login failed for {scraper_name}: {failure_reason}",
                    context=error_context,
                    cause=exc,
                ) from exc
            raise WorkflowExecutionError(
                f"Login failed for {scraper_name}: {failure_reason}",
                context=error_context,
                cause=exc,
            ) from exc

    def _current_sku(self) -> str | None:
        for container_name in ("context", "results"):
            container = getattr(self.ctx, container_name, {}) or {}
            if not isinstance(container, dict):
                continue
            candidate = container.get("sku")
            if candidate is None:
                continue
            normalized = str(candidate).strip()
            if normalized:
                return normalized
        return None

    def _candidate_credential_refs(self, scraper_name: str) -> list[str]:
        refs = [scraper_name]
        refs.extend(
            str(ref).strip()
            for ref in (getattr(self.ctx.config, "credential_refs", []) or [])
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

    def _resolve_login_credentials(
        self,
        login_params: dict[str, Any],
        scraper_name: str,
    ) -> dict[str, Any]:
        candidate_refs = self._candidate_credential_refs(scraper_name)
        resolved_credentials = getattr(self.ctx, "credentials", {}) or {}
        available_resolved_refs = (
            sorted(str(ref) for ref in resolved_credentials.keys())
            if isinstance(resolved_credentials, dict)
            else []
        )
        had_param_credentials = bool(login_params.get("username") and login_params.get("password"))
        resolution: dict[str, Any] = {
            "candidate_refs": candidate_refs,
            "available_resolved_refs": available_resolved_refs,
            "credential_source": None,
            "credential_ref": None,
        }

        if had_param_credentials:
            resolution["credential_source"] = "params"

        option_creds = getattr(self.ctx.config, "options", {}) or {}
        if isinstance(option_creds, dict):
            legacy_creds = option_creds.get("_credentials")
            if isinstance(legacy_creds, dict):
                login_params.setdefault("username", legacy_creds.get("username"))
                login_params.setdefault("password", legacy_creds.get("password"))
                if legacy_creds.get("api_key") and not login_params.get("api_key"):
                    login_params["api_key"] = legacy_creds.get("api_key")
                if (
                    login_params.get("username")
                    and login_params.get("password")
                    and resolution.get("credential_source") is None
                ):
                    resolution["credential_source"] = "config.options._credentials"

        if not isinstance(resolved_credentials, dict):
            resolved_credentials = {}

        for ref in candidate_refs:
            resolved = resolved_credentials.get(ref)
            if not isinstance(resolved, dict):
                continue
            login_params.setdefault("username", resolved.get("username"))
            login_params.setdefault("password", resolved.get("password"))
            if resolved.get("api_key") and not login_params.get("api_key"):
                login_params["api_key"] = resolved.get("api_key")
            if not had_param_credentials and login_params.get("username") and login_params.get("password"):
                resolution["credential_source"] = str(
                    resolved.get("_credential_source") or resolution.get("credential_source") or "resolved_credentials"
                )
                resolution["credential_ref"] = str(
                    resolved.get("_credential_ref") or ref
                )
                break

        resolution["has_username"] = bool(login_params.get("username"))
        resolution["has_password"] = bool(login_params.get("password"))
        resolution["has_api_key"] = bool(login_params.get("api_key"))
        return resolution

    async def _collect_login_failure_details(
        self,
        *,
        login_params: dict[str, Any],
        credential_resolution: dict[str, Any],
        current_step: dict[str, str],
        error: Exception,
        sku: str | None,
    ) -> dict[str, Any]:
        runtime_debug = await self._collect_runtime_debug_context()
        failure_indicator = await self._detect_failure_indicator(login_params)
        current_url = self._extract_current_url(runtime_debug)
        auth_flow_state = self._detect_auth_flow_state(
            login_url=str(login_params.get("url") or "").strip(),
            current_url=current_url,
            current_step=current_step,
        )
        category = "authentication" if (
            isinstance(error, AuthenticationError)
            or failure_indicator is not None
            or auth_flow_state in {"still_on_auth_page", "auth_redirect"}
        ) else "workflow"

        return {
            "category": category,
            "current_step": current_step,
            "credential_resolution": credential_resolution,
            "failure_indicator": failure_indicator,
            "auth_flow_state": auth_flow_state,
            "runtime_debug": runtime_debug,
            "error_type": type(error).__name__,
            "sku": sku,
        }

    async def _collect_runtime_debug_context(self) -> dict[str, Any]:
        collector = getattr(self.ctx, "collect_runtime_debug_context", None)
        if not callable(collector):
            return {}

        try:
            return await collector(include_screenshot=True)
        except Exception as exc:
            return {"debug_context_error": str(exc)}

    async def _detect_failure_indicator(self, login_params: dict[str, Any]) -> dict[str, str] | None:
        failure_indicators = login_params.get("failure_indicators")
        if not isinstance(failure_indicators, dict):
            return None

        for selector in _normalize_string_list(failure_indicators.get("selectors")) + _normalize_string_list(failure_indicators.get("selector")):
            try:
                element = await self.ctx.find_element_safe(selector, required=False, timeout=2)
            except Exception:
                element = None
            if element is not None:
                return {"type": "selector", "value": selector}

        page = getattr(getattr(self.ctx, "browser", None), "page", None)
        if page is not None and hasattr(page, "content"):
            try:
                page_content = (await page.content()).lower()
            except Exception:
                page_content = ""
            for text_pattern in _normalize_string_list(failure_indicators.get("texts")) + _normalize_string_list(failure_indicators.get("text_patterns")):
                if text_pattern.lower() in page_content:
                    return {"type": "text", "value": text_pattern}

        current_url = ""
        try:
            current_url = str(getattr(page, "url", "") or "")
        except Exception:
            current_url = ""
        for fragment in _normalize_string_list(failure_indicators.get("url_contains")):
            if fragment.lower() in current_url.lower():
                return {"type": "url", "value": fragment}

        return None

    def _extract_current_url(self, runtime_debug: dict[str, Any]) -> str | None:
        page_url = runtime_debug.get("page_url")
        if isinstance(page_url, str) and page_url:
            return page_url

        browser_debug = runtime_debug.get("browser")
        if isinstance(browser_debug, dict):
            current_url = browser_debug.get("current_url")
            if isinstance(current_url, str) and current_url:
                return current_url

        return None

    def _detect_auth_flow_state(
        self,
        *,
        login_url: str,
        current_url: str | None,
        current_step: dict[str, str],
    ) -> str | None:
        if not current_url:
            return None

        lowered_current = current_url.lower()
        lowered_login = login_url.lower()
        auth_tokens = ("login", "signin", "sign-in", "authenticate", "auth")
        is_auth_url = any(token in lowered_current for token in auth_tokens)
        login_prefix = lowered_login.split("?", 1)[0] if lowered_login else ""

        if current_step.get("name") == "wait_for_success_indicator" and (
            (login_prefix and lowered_current.startswith(login_prefix)) or is_auth_url
        ):
            return "still_on_auth_page"

        if is_auth_url and login_prefix and not lowered_current.startswith(login_prefix):
            return "auth_redirect"

        return None

    def _build_failure_reason(
        self,
        *,
        error: Exception,
        failure_details: dict[str, Any],
        current_step: dict[str, str],
    ) -> str:
        if isinstance(error, AuthenticationError):
            return error.message

        failure_indicator = failure_details.get("failure_indicator")
        if isinstance(failure_indicator, dict):
            indicator_type = str(failure_indicator.get("type") or "indicator")
            indicator_value = str(failure_indicator.get("value") or "")
            return f"failure indicator matched ({indicator_type}: {indicator_value})"

        auth_flow_state = failure_details.get("auth_flow_state")
        runtime_debug = failure_details.get("runtime_debug")
        current_url = self._extract_current_url(runtime_debug if isinstance(runtime_debug, dict) else {})
        if auth_flow_state == "still_on_auth_page":
            return f"login did not leave the auth page after submit{f' ({current_url})' if current_url else ''}"
        if auth_flow_state == "auth_redirect":
            return f"login redirected into an auth flow{f' ({current_url})' if current_url else ''}"

        current_step_name = current_step.get("name")
        current_selector = current_step.get("selector")
        if current_step_name and current_selector:
            return f"{current_step_name} failed for selector '{current_selector}': {error}"
        if current_step_name:
            return f"{current_step_name} failed: {error}"
        return str(error)

    def _log_login(
        self,
        level: int,
        message: str,
        *,
        sku: str | None,
        details: dict[str, Any] | None = None,
        flush_immediately: bool = False,
    ) -> None:
        logger.log(
            level,
            message,
            extra={
                "scraper_name": self.ctx.config.name,
                "sku": sku,
                "phase": "login",
                "details": details,
                "flush_immediately": flush_immediately,
            },
        )

    async def _validate_login_selectors(self, params: dict[str, Any]) -> None:
        """
        Validate presence of login selectors on the page and log results for UI.
        Used in test_mode.
        """
        await asyncio.sleep(2)

        selectors = {
            "username_field": params.get("username_field"),
            "password_field": params.get("password_field"),
            "submit_button": params.get("submit_button"),
        }

        for name, selector in selectors.items():
            if not selector:
                continue

            element = await self.ctx.find_element_safe(cast(str, selector), required=False)
            status = "FOUND" if element else "MISSING"

            logger.info(f"[LOGIN_SELECTOR] {name}: '{status}'")

            if self.ctx.event_emitter:
                self.ctx.event_emitter.login_selector_status(
                    scraper=self.ctx.config.name,
                    selector_name=name,
                    status=status,
                )
