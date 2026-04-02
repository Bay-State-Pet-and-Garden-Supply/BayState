from __future__ import annotations

import importlib
import random
from dataclasses import dataclass
from itertools import cycle
from typing import Literal, Protocol, cast

from collections.abc import Mapping, Sequence


RotationStrategy = Literal["random", "round_robin"]

DEFAULT_STEALTH_ARGS: tuple[str, ...] = (
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--no-first-run",
)

DEFAULT_USER_AGENTS: tuple[str, ...] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
)


class _BrowserConfigFactory(Protocol):
    def __call__(
        self,
        *,
        headless: bool,
        stealth_mode: bool,
        extra_args: list[str],
    ) -> object: ...


@dataclass(frozen=True, slots=True)
class BrowserFingerprint:
    viewport_width: int = 1920
    viewport_height: int = 1080
    locale: str = "en-US"
    timezone_id: str = "America/New_York"
    platform: str = "Win32"
    device_scale_factor: float = 1.0

    def to_browser_config_kwargs(self) -> dict[str, object]:
        return {
            "viewport": {
                "width": self.viewport_width,
                "height": self.viewport_height,
            },
            "locale": self.locale,
            "timezone_id": self.timezone_id,
            "device_scale_factor": self.device_scale_factor,
            "platform": self.platform,
        }


DEFAULT_FINGERPRINTS: tuple[BrowserFingerprint, ...] = (
    BrowserFingerprint(
        viewport_width=1920,
        viewport_height=1080,
        locale="en-US",
        timezone_id="America/New_York",
        platform="Win32",
        device_scale_factor=1.0,
    ),
    BrowserFingerprint(
        viewport_width=1366,
        viewport_height=768,
        locale="en-GB",
        timezone_id="Europe/London",
        platform="Win32",
        device_scale_factor=1.0,
    ),
    BrowserFingerprint(
        viewport_width=1440,
        viewport_height=900,
        locale="en-US",
        timezone_id="America/Los_Angeles",
        platform="MacIntel",
        device_scale_factor=2.0,
    ),
)


@dataclass(frozen=True, slots=True)
class AntiBotSettings:
    stealth: bool = True
    headless: bool = True
    proxy_pool: tuple[str, ...] = ()
    user_agent_pool: tuple[str, ...] = DEFAULT_USER_AGENTS
    fingerprint_pool: tuple[BrowserFingerprint, ...] = DEFAULT_FINGERPRINTS
    extra_args: tuple[str, ...] = DEFAULT_STEALTH_ARGS
    rotation_strategy: RotationStrategy = "round_robin"
    rng_seed: int | None = None

    @classmethod
    def from_scraper_config(cls, config: Mapping[str, object]) -> AntiBotSettings:
        user_agents = _extract_string_tuple(config.get("user_agents"), fallback=DEFAULT_USER_AGENTS)
        proxies = _extract_string_tuple(config.get("proxies"), fallback=())
        extra_args = _extract_string_tuple(config.get("extra_args"), fallback=DEFAULT_STEALTH_ARGS)
        fingerprints = _extract_fingerprints(config.get("fingerprints"), fallback=DEFAULT_FINGERPRINTS)

        raw_rotation = _as_clean_string(config.get("rotation_strategy"))
        rotation_strategy: RotationStrategy = "random" if raw_rotation == "random" else "round_robin"

        rng_seed = _coerce_int(config.get("rng_seed"))
        stealth = _coerce_bool(config.get("stealth"), default=True)
        headless = _coerce_bool(config.get("headless"), default=True)

        return cls(
            stealth=stealth,
            headless=headless,
            proxy_pool=proxies,
            user_agent_pool=user_agents,
            fingerprint_pool=fingerprints,
            extra_args=extra_args,
            rotation_strategy=rotation_strategy,
            rng_seed=rng_seed,
        )


@dataclass(frozen=True, slots=True)
class AntiBotSelection:
    proxy: str | None = None
    user_agent: str | None = None
    fingerprint: BrowserFingerprint | None = None


class AntiBotConfigGenerator:
    settings: AntiBotSettings
    _rng: random.Random
    _proxy_cycle: cycle[str] | None
    _user_agent_cycle: cycle[str] | None
    _fingerprint_cycle: cycle[BrowserFingerprint] | None

    def __init__(self, settings: AntiBotSettings | None = None) -> None:
        self.settings = settings or AntiBotSettings()
        self._rng = random.Random(self.settings.rng_seed)
        self._proxy_cycle = cycle(self.settings.proxy_pool) if self.settings.proxy_pool else None
        self._user_agent_cycle = cycle(self.settings.user_agent_pool) if self.settings.user_agent_pool else None
        self._fingerprint_cycle = cycle(self.settings.fingerprint_pool) if self.settings.fingerprint_pool else None

    def next_selection(
        self,
        *,
        proxy: str | None = None,
        user_agent: str | None = None,
        fingerprint: BrowserFingerprint | None = None,
    ) -> AntiBotSelection:
        selected_proxy = proxy if proxy is not None else self._rotate_proxy()
        selected_user_agent = user_agent if user_agent is not None else self._rotate_user_agent()
        selected_fingerprint = fingerprint if fingerprint is not None else self._rotate_fingerprint()

        return AntiBotSelection(
            proxy=selected_proxy,
            user_agent=selected_user_agent,
            fingerprint=selected_fingerprint,
        )

    def create_browser_config(
        self,
        *,
        stealth: bool | None = None,
        proxy: str | None = None,
        user_agent: str | None = None,
        fingerprint: BrowserFingerprint | None = None,
    ) -> object:
        crawl4ai_module = importlib.import_module("crawl4ai")
        browser_config_attr = getattr(crawl4ai_module, "BrowserConfig")
        browser_config_cls = cast(_BrowserConfigFactory, browser_config_attr)

        selected = self.next_selection(
            proxy=proxy,
            user_agent=user_agent,
            fingerprint=fingerprint,
        )

        final_stealth = self.settings.stealth if stealth is None else stealth
        config = browser_config_cls(
            headless=self.settings.headless,
            stealth_mode=final_stealth,
            extra_args=list(self.settings.extra_args),
        )

        if selected.proxy is not None:
            _set_if_supported(config, "proxy", selected.proxy)

        if selected.user_agent is not None:
            _set_if_supported(config, "user_agent", selected.user_agent)

        if selected.fingerprint is not None:
            kwargs = selected.fingerprint.to_browser_config_kwargs()
            for key, value in kwargs.items():
                _set_if_supported(config, key, value)

        return config

    def _rotate_proxy(self) -> str | None:
        if not self.settings.proxy_pool:
            return None
        if self.settings.rotation_strategy == "random":
            return self._rng.choice(self.settings.proxy_pool)
        if self._proxy_cycle is None:
            self._proxy_cycle = cycle(self.settings.proxy_pool)
        return next(self._proxy_cycle)

    def _rotate_user_agent(self) -> str | None:
        if not self.settings.user_agent_pool:
            return None
        if self.settings.rotation_strategy == "random":
            return self._rng.choice(self.settings.user_agent_pool)
        if self._user_agent_cycle is None:
            self._user_agent_cycle = cycle(self.settings.user_agent_pool)
        return next(self._user_agent_cycle)

    def _rotate_fingerprint(self) -> BrowserFingerprint | None:
        if not self.settings.fingerprint_pool:
            return None
        if self.settings.rotation_strategy == "random":
            return self._rng.choice(self.settings.fingerprint_pool)
        if self._fingerprint_cycle is None:
            self._fingerprint_cycle = cycle(self.settings.fingerprint_pool)
        return next(self._fingerprint_cycle)


class ScraperAntiBotManager:
    _default_settings: AntiBotSettings
    _generators: dict[str, AntiBotConfigGenerator]

    def __init__(
        self,
        default_settings: AntiBotSettings | None = None,
        scraper_settings: Mapping[str, AntiBotSettings | Mapping[str, object]] | None = None,
    ) -> None:
        self._default_settings = default_settings or AntiBotSettings()
        self._generators = {}

        if scraper_settings is not None:
            for scraper_name, settings in scraper_settings.items():
                self.register_scraper(scraper_name, settings)

    def register_scraper(
        self,
        scraper_name: str,
        settings: AntiBotSettings | Mapping[str, object],
    ) -> None:
        resolved_settings = settings if isinstance(settings, AntiBotSettings) else AntiBotSettings.from_scraper_config(settings)
        self._generators[scraper_name] = AntiBotConfigGenerator(resolved_settings)

    def create_browser_config(
        self,
        scraper_name: str,
        *,
        stealth: bool | None = None,
        proxy: str | None = None,
        user_agent: str | None = None,
        fingerprint: BrowserFingerprint | None = None,
    ) -> object:
        generator = self._generators.get(scraper_name)
        if generator is None:
            generator = AntiBotConfigGenerator(self._default_settings)
            self._generators[scraper_name] = generator

        return generator.create_browser_config(
            stealth=stealth,
            proxy=proxy,
            user_agent=user_agent,
            fingerprint=fingerprint,
        )


def create_stealth_config(
    stealth: bool = True,
    proxy: str | None = None,
    user_agent: str | None = None,
) -> object:
    generator = AntiBotConfigGenerator(settings=AntiBotSettings(stealth=stealth))
    return generator.create_browser_config(
        stealth=stealth,
        proxy=proxy,
        user_agent=user_agent,
    )


def _extract_string_tuple(value: object, *, fallback: tuple[str, ...]) -> tuple[str, ...]:
    if isinstance(value, tuple):
        tuple_values = cast(tuple[object, ...], value)
        cleaned_values = tuple(_as_clean_string(v) for v in tuple_values)
        cleaned = tuple(item for item in cleaned_values if item is not None)
        return cleaned or fallback

    if isinstance(value, list):
        list_values = cast(list[object], value)
        cleaned_values = tuple(_as_clean_string(v) for v in list_values)
        cleaned = tuple(item for item in cleaned_values if item is not None)
        return cleaned or fallback

    return fallback


def _extract_fingerprints(
    value: object,
    *,
    fallback: tuple[BrowserFingerprint, ...],
) -> tuple[BrowserFingerprint, ...]:
    if not isinstance(value, (list, tuple)):
        return fallback

    fingerprints: list[BrowserFingerprint] = []
    raw_items = cast(Sequence[object], value)
    for item in raw_items:
        if isinstance(item, BrowserFingerprint):
            fingerprints.append(item)
            continue

        if not isinstance(item, Mapping):
            continue

        item_mapping = cast(Mapping[str, object], item)

        width = _coerce_int(item_mapping.get("viewport_width"), default=1920)
        height = _coerce_int(item_mapping.get("viewport_height"), default=1080)
        final_width = 1920 if width is None else width
        final_height = 1080 if height is None else height

        viewport = item_mapping.get("viewport")
        if isinstance(viewport, Mapping):
            viewport_mapping = cast(Mapping[str, object], viewport)
            width = _coerce_int(viewport_mapping.get("width"), default=final_width)
            height = _coerce_int(viewport_mapping.get("height"), default=final_height)
            final_width = final_width if width is None else width
            final_height = final_height if height is None else height

        locale = _as_clean_string(item_mapping.get("locale")) or "en-US"
        timezone_id = _as_clean_string(item_mapping.get("timezone_id")) or "America/New_York"
        platform = _as_clean_string(item_mapping.get("platform")) or "Win32"
        device_scale_factor = _coerce_float(item_mapping.get("device_scale_factor"), default=1.0)

        fingerprints.append(
            BrowserFingerprint(
                viewport_width=final_width,
                viewport_height=final_height,
                locale=locale,
                timezone_id=timezone_id,
                platform=platform,
                device_scale_factor=device_scale_factor,
            )
        )

    return tuple(fingerprints) or fallback


def _as_clean_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _coerce_bool(value: object, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _coerce_int(value: object, *, default: int | None = None) -> int | None:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default
        try:
            return int(stripped)
        except ValueError:
            return default
    return default


def _coerce_float(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default
        try:
            return float(stripped)
        except ValueError:
            return default
    return default


def _set_if_supported(config: object, key: str, value: object) -> None:
    try:
        setattr(config, key, value)
    except Exception:
        return


__all__ = [
    "AntiBotConfigGenerator",
    "AntiBotSelection",
    "AntiBotSettings",
    "BrowserFingerprint",
    "DEFAULT_FINGERPRINTS",
    "DEFAULT_STEALTH_ARGS",
    "DEFAULT_USER_AGENTS",
    "ScraperAntiBotManager",
    "create_stealth_config",
]
