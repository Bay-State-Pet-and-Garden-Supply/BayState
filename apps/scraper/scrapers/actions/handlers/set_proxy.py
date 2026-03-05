from __future__ import annotations

import logging
from typing import Any
from typing_extensions import override

from ..base import BaseAction
from ..registry import ActionRegistry
from ...models.config import ProxyConfig
from utils.proxy_rotator import ProxyRotator

logger = logging.getLogger(__name__)


@ActionRegistry.register("set_proxy")
class SetProxyAction(BaseAction):
    """Set a proxy on the current browser context using ProxyRotator.

    Notes:
    - Does not create new browser contexts or restart browser
    - Stores rotator in self.ctx.results for reuse
    - Logs only host:port (no credentials)
    """

    @override
    async def execute(self, params: dict[str, object]) -> None:
        # Accept either a 'proxy' dict inside params or use scraper-level config
        proxy_params = params.get("proxy") if params is not None else None

        proxy_config: ProxyConfig | None = None
        if isinstance(proxy_params, dict):
            try:
                proxy_config = ProxyConfig(**(proxy_params or {}))
            except Exception:
                proxy_config = None

        if proxy_config is None:
            proxy_config = getattr(self.ctx.config, "proxy_config", None)

        if not proxy_config:
            logger.info("No proxy configuration provided; skipping set_proxy action.")
            return

        try:
            rotator = ProxyRotator.from_proxy_config(proxy_config)
        except Exception as e:
            logger.warning("Failed to initialize ProxyRotator: %s", e)
            return

        # Try to infer site from current page to support per_site rotation
        site = None
        try:
            page = getattr(self.ctx.browser, "page", None)
            if page is not None:
                current_url = getattr(page, "url", None)
                if current_url:
                    from urllib.parse import urlparse

                    parsed = urlparse(current_url)
                    site = parsed.netloc or None
        except Exception:
            site = None

        proxy_url = rotator.get_proxy(site=site)
        if not proxy_url:
            logger.warning("ProxyRotator returned no proxy; skipping applying proxy.")
            return

        try:
            browser = getattr(self.ctx, "browser", None)
            if browser is None:
                logger.warning("No browser available on context to apply proxy.")
                return

            # If browser wrapper supports dynamic set_proxy, prefer it
            if hasattr(browser, "set_proxy"):
                await browser.set_proxy({"server": proxy_url})
            else:
                # Otherwise attach to browser object; browser manager will apply when creating contexts
                try:
                    setattr(browser, "proxy", {"server": proxy_url})
                except Exception:
                    underlying = getattr(browser, "browser", None)
                    if underlying is not None:
                        try:
                            setattr(underlying, "proxy", {"server": proxy_url})
                        except Exception:
                            logger.warning("Unable to set proxy on browser object")

            # Persist rotator and last used (scrubbed) into results for reuse
            # Persist rotator and last used (scrubbed) into results for reuse
            try:
                results = getattr(self.ctx, "results", None)
                if results is None:
                    self.ctx.results = {}
                safe = _scrub_credentials(proxy_url)
                self.ctx.results.setdefault("proxy_rotator", {})["last_used"] = safe
                # Storing the rotator instance in results may not be serializable; keep for in-process reuse
                self.ctx.results["proxy_rotator"]["rotator"] = rotator
            except Exception:
                # Do not fail workflow for storage errors
                pass

            host_port = _extract_host_port(proxy_url)
            logger.info("Setting proxy: %s", host_port)

        except Exception as e:
            logger.warning("Failed to apply proxy to browser: %s", e)


def _scrub_credentials(proxy_url: str) -> str:
    """Return proxy_url with credentials removed for logging/storage."""
    try:
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(proxy_url)
        netloc = parsed.hostname or ""
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        cleaned = parsed._replace(netloc=netloc, username=None, password=None)
        return urlunparse(cleaned)
    except Exception:
        if "@" in proxy_url:
            return proxy_url.split("@", 1)[1]
        return proxy_url


def _extract_host_port(proxy_url: str) -> str:
    try:
        from urllib.parse import urlparse

        parsed = urlparse(proxy_url)
        host = parsed.hostname or ""
        port = parsed.port
        return f"{host}:{port}" if port else host
    except Exception:
        cleaned = _scrub_credentials(proxy_url)
        if ":" in cleaned:
            return cleaned.split("//")[-1]
        return cleaned
