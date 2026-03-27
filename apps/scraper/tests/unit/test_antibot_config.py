from __future__ import annotations

from types import SimpleNamespace

from src.crawl4ai_engine.anti_bot import (
    AntiBotConfigGenerator,
    AntiBotSettings,
    BrowserFingerprint,
    ScraperAntiBotManager,
    create_stealth_config,
)


class DummyBrowserConfig:
    def __init__(self, *, headless: bool, stealth_mode: bool, extra_args: list[str]) -> None:
        self.headless = headless
        self.stealth_mode = stealth_mode
        self.extra_args = extra_args


def test_browser_fingerprint_to_browser_config_kwargs() -> None:
    fingerprint = BrowserFingerprint(
        viewport_width=1280,
        viewport_height=720,
        locale="en-GB",
        timezone_id="Europe/London",
        platform="MacIntel",
        device_scale_factor=2.0,
    )

    assert fingerprint.to_browser_config_kwargs() == {
        "viewport": {"width": 1280, "height": 720},
        "locale": "en-GB",
        "timezone_id": "Europe/London",
        "device_scale_factor": 2.0,
        "platform": "MacIntel",
    }


def test_antibot_settings_from_scraper_config_normalizes_values() -> None:
    settings = AntiBotSettings.from_scraper_config(
        {
            "stealth": False,
            "headless": False,
            "proxies": ["http://proxy-1:8080", "", "http://proxy-2:8080"],
            "user_agents": ["UA-1", "UA-2"],
            "extra_args": ["--foo"],
            "rotation_strategy": "random",
            "rng_seed": "17",
            "fingerprints": [
                {
                    "viewport": {"width": 1440, "height": 900},
                    "locale": "en-US",
                    "timezone_id": "America/Chicago",
                    "platform": "Win32",
                    "device_scale_factor": 1.5,
                }
            ],
        }
    )

    assert settings.stealth is False
    assert settings.headless is False
    assert settings.proxy_pool == ("http://proxy-1:8080", "http://proxy-2:8080")
    assert settings.user_agent_pool == ("UA-1", "UA-2")
    assert settings.extra_args == ("--foo",)
    assert settings.rotation_strategy == "random"
    assert settings.rng_seed == 17
    assert settings.fingerprint_pool == (
        BrowserFingerprint(
            viewport_width=1440,
            viewport_height=900,
            locale="en-US",
            timezone_id="America/Chicago",
            platform="Win32",
            device_scale_factor=1.5,
        ),
    )


def test_antibot_generator_rotates_round_robin() -> None:
    settings = AntiBotSettings(
        proxy_pool=("http://proxy-1:8080", "http://proxy-2:8080"),
        user_agent_pool=("UA-1", "UA-2"),
        fingerprint_pool=(
            BrowserFingerprint(viewport_width=1280, viewport_height=720),
            BrowserFingerprint(viewport_width=1366, viewport_height=768),
        ),
        rotation_strategy="round_robin",
    )
    generator = AntiBotConfigGenerator(settings)

    first = generator.next_selection()
    second = generator.next_selection()
    third = generator.next_selection()

    assert first.proxy == "http://proxy-1:8080"
    assert second.proxy == "http://proxy-2:8080"
    assert third.proxy == "http://proxy-1:8080"

    assert first.user_agent == "UA-1"
    assert second.user_agent == "UA-2"
    assert third.user_agent == "UA-1"

    assert first.fingerprint == BrowserFingerprint(viewport_width=1280, viewport_height=720)
    assert second.fingerprint == BrowserFingerprint(viewport_width=1366, viewport_height=768)
    assert third.fingerprint == BrowserFingerprint(viewport_width=1280, viewport_height=720)


def test_antibot_generator_create_browser_config_applies_selection(monkeypatch) -> None:
    crawl4ai_module = SimpleNamespace(BrowserConfig=DummyBrowserConfig)
    monkeypatch.setattr(
        "src.crawl4ai_engine.anti_bot.importlib.import_module",
        lambda module_name: crawl4ai_module if module_name == "crawl4ai" else __import__(module_name),
    )

    fingerprint = BrowserFingerprint(
        viewport_width=1600,
        viewport_height=900,
        locale="en-CA",
        timezone_id="America/Toronto",
        platform="Win32",
        device_scale_factor=1.25,
    )
    generator = AntiBotConfigGenerator(
        AntiBotSettings(
            stealth=True,
            headless=False,
            proxy_pool=("http://proxy:8080",),
            user_agent_pool=("UA-1",),
            fingerprint_pool=(fingerprint,),
            extra_args=("--disable-blink-features=AutomationControlled", "--foo"),
        )
    )

    config = generator.create_browser_config()

    assert isinstance(config, DummyBrowserConfig)
    assert config.headless is False
    assert config.stealth_mode is True
    assert config.extra_args == ["--disable-blink-features=AutomationControlled", "--foo"]
    assert config.proxy == "http://proxy:8080"
    assert config.user_agent == "UA-1"
    assert config.viewport == {"width": 1600, "height": 900}
    assert config.locale == "en-CA"
    assert config.timezone_id == "America/Toronto"
    assert config.platform == "Win32"
    assert config.device_scale_factor == 1.25


def test_scraper_antibot_manager_uses_registered_scraper_settings(monkeypatch) -> None:
    crawl4ai_module = SimpleNamespace(BrowserConfig=DummyBrowserConfig)
    monkeypatch.setattr(
        "src.crawl4ai_engine.anti_bot.importlib.import_module",
        lambda module_name: crawl4ai_module if module_name == "crawl4ai" else __import__(module_name),
    )

    manager = ScraperAntiBotManager(
        default_settings=AntiBotSettings(proxy_pool=("http://default:8080",), user_agent_pool=("UA-default",)),
        scraper_settings={
            "amazon": {
                "proxies": ["http://amazon:8080"],
                "user_agents": ["UA-amazon"],
                "rotation_strategy": "round_robin",
            }
        },
    )

    config = manager.create_browser_config("amazon")

    assert isinstance(config, DummyBrowserConfig)
    assert config.proxy == "http://amazon:8080"
    assert config.user_agent == "UA-amazon"


def test_create_stealth_config_wraps_antibot_generator(monkeypatch) -> None:
    crawl4ai_module = SimpleNamespace(BrowserConfig=DummyBrowserConfig)
    monkeypatch.setattr(
        "src.crawl4ai_engine.anti_bot.importlib.import_module",
        lambda module_name: crawl4ai_module if module_name == "crawl4ai" else __import__(module_name),
    )

    config = create_stealth_config(stealth=False, proxy="http://proxy:8080", user_agent="UA-1")

    assert isinstance(config, DummyBrowserConfig)
    assert config.stealth_mode is False
    assert config.proxy == "http://proxy:8080"
    assert config.user_agent == "UA-1"
