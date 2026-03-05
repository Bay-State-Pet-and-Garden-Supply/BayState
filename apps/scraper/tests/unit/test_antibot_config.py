"""Tests for the anti-bot configuration module."""

import pytest

from lib.antibot import (
    AntiBotConfig,
    BrowserFingerprint,
    DeviceType,
    OsType,
    ProxyConfig,
    ProxyRotationStrategy,
    StealthMode,
    UserAgentMode,
    create_basic_config,
    create_config,
    create_stealth_config,
)


class TestStealthMode:
    """Tests for StealthMode enum."""

    def test_stealth_mode_values(self):
        assert StealthMode.OFF.value == "off"
        assert StealthMode.BASIC.value == "basic"
        assert StealthMode.FULL.value == "full"


class TestUserAgentMode:
    """Tests for UserAgentMode enum."""

    def test_user_agent_mode_values(self):
        assert UserAgentMode.STATIC.value == "static"
        assert UserAgentMode.RANDOM.value == "random"
        assert UserAgentMode.ROTATE.value == "rotate"


class TestProxyRotationStrategy:
    """Tests for ProxyRotationStrategy enum."""

    def test_proxy_rotation_values(self):
        assert ProxyRotationStrategy.NONE.value == "none"
        assert ProxyRotationStrategy.ROUND_ROBIN.value == "round_robin"
        assert ProxyRotationStrategy.RANDOM.value == "random"
        assert ProxyRotationStrategy.LEAST_USED.value == "least_used"


class TestDeviceType:
    """Tests for DeviceType enum."""

    def test_device_type_values(self):
        assert DeviceType.DESKTOP.value == "desktop"
        assert DeviceType.MOBILE.value == "mobile"
        assert DeviceType.TABLET.value == "tablet"


class TestOsType:
    """Tests for OsType enum."""

    def test_os_type_values(self):
        assert OsType.WINDOWS.value == "windows"
        assert OsType.MACOS.value == "macos"
        assert OsType.LINUX.value == "linux"
        assert OsType.ANDROID.value == "android"
        assert OsType.IOS.value == "ios"


class TestBrowserFingerprint:
    """Tests for BrowserFingerprint dataclass."""

    def test_default_values(self):
        fp = BrowserFingerprint()
        assert fp.viewport_width == 1920
        assert fp.viewport_height == 1080
        assert fp.device_type == DeviceType.DESKTOP
        assert fp.os_type == OsType.WINDOWS
        assert fp.browser_type == "chromium"

    def test_custom_values(self):
        fp = BrowserFingerprint(
            viewport_width=1280,
            viewport_height=720,
            device_type=DeviceType.MOBILE,
            os_type=OsType.ANDROID,
        )
        assert fp.viewport_width == 1280
        assert fp.viewport_height == 720
        assert fp.device_type == DeviceType.MOBILE
        assert fp.os_type == OsType.ANDROID

    def test_to_crawl4ai_config(self):
        fp = BrowserFingerprint(viewport_width=1280, viewport_height=720)
        config = fp.to_crawl4ai_config()
        assert config["viewport_width"] == 1280
        assert config["viewport_height"] == 720
        assert config["browser_type"] == "chromium"

    def test_to_user_agent_config(self):
        fp = BrowserFingerprint(device_type=DeviceType.MOBILE, os_type=OsType.IOS)
        config = fp.to_user_agent_config()
        assert config["device_type"] == "mobile"
        assert config["os_type"] == "ios"


class TestProxyConfig:
    """Tests for ProxyConfig dataclass."""

    def test_basic_proxy(self):
        proxy = ProxyConfig(server="http://proxy:8080")
        assert proxy.server == "http://proxy:8080"
        assert proxy.username is None
        assert proxy.password is None

    def test_authenticated_proxy(self):
        proxy = ProxyConfig(
            server="http://proxy:8080",
            username="user",
            password="pass",
        )
        assert proxy.server == "http://proxy:8080"
        assert proxy.username == "user"
        assert proxy.password == "pass"

    def test_to_crawl4ai_config(self):
        proxy = ProxyConfig(
            server="http://proxy:8080",
            username="user",
            password="pass",
        )
        config = proxy.to_crawl4ai_config()
        assert config["server"] == "http://proxy:8080"
        assert config["username"] == "user"
        assert config["password"] == "pass"

    def test_to_crawl4ai_config_no_auth(self):
        proxy = ProxyConfig(server="http://proxy:8080")
        config = proxy.to_crawl4ai_config()
        assert config["server"] == "http://proxy:8080"
        assert "username" not in config
        assert "password" not in config

    def test_str_no_password_exposed(self):
        proxy = ProxyConfig(
            server="http://proxy:8080",
            username="user",
            password="secret",
        )
        str_repr = str(proxy)
        assert "secret" not in str_repr
        assert "user@" in str_repr


class TestAntiBotConfig:
    """Tests for AntiBotConfig dataclass."""

    def test_default_values(self):
        config = AntiBotConfig()
        assert config.stealth_mode == StealthMode.OFF
        assert config.user_agent_mode == UserAgentMode.STATIC
        assert config.user_agent is None
        assert config.proxy_rotation == ProxyRotationStrategy.NONE

    def test_full_stealth_auto_enables_navigator_override(self):
        config = AntiBotConfig(stealth_mode=StealthMode.FULL)
        assert config.override_navigator is True

    def test_rotate_mode_requires_user_agents(self):
        with pytest.raises(ValueError, match="user_agents list must be provided"):
            AntiBotConfig(user_agent_mode=UserAgentMode.ROTATE)

    def test_proxy_rotation_requires_proxies(self):
        with pytest.raises(ValueError, match="proxies list must be provided"):
            AntiBotConfig(proxy_rotation=ProxyRotationStrategy.ROUND_ROBIN)

    def test_get_next_user_agent_static(self):
        config = AntiBotConfig(
            user_agent_mode=UserAgentMode.STATIC,
            user_agent="Mozilla/5.0 Test",
        )
        assert config.get_next_user_agent() == "Mozilla/5.0 Test"

    def test_get_next_user_agent_rotate(self):
        config = AntiBotConfig(
            user_agent_mode=UserAgentMode.ROTATE,
            user_agents=["UA1", "UA2", "UA3"],
        )
        assert config.get_next_user_agent() == "UA1"
        assert config.get_next_user_agent() == "UA2"
        assert config.get_next_user_agent() == "UA3"
        assert config.get_next_user_agent() == "UA1"  # Cycles back

    def test_get_next_user_agent_random_with_list(self):
        config = AntiBotConfig(
            user_agent_mode=UserAgentMode.RANDOM,
            user_agents=["UA1", "UA2", "UA3"],
        )
        ua = config.get_next_user_agent()
        assert ua in ["UA1", "UA2", "UA3"]

    def test_get_next_proxy_none(self):
        config = AntiBotConfig(proxy_rotation=ProxyRotationStrategy.NONE)
        assert config.get_next_proxy() is None

    def test_get_next_proxy_single(self):
        proxy = ProxyConfig(server="http://proxy:8080")
        config = AntiBotConfig(proxy=proxy)
        assert config.get_next_proxy() == proxy

    def test_get_next_proxy_round_robin(self):
        proxies = [
            ProxyConfig(server="http://proxy1:8080"),
            ProxyConfig(server="http://proxy2:8080"),
        ]
        config = AntiBotConfig(
            proxies=proxies,
            proxy_rotation=ProxyRotationStrategy.ROUND_ROBIN,
        )
        assert config.get_next_proxy().server == "http://proxy1:8080"
        assert config.get_next_proxy().server == "http://proxy2:8080"
        assert config.get_next_proxy().server == "http://proxy1:8080"

    def test_get_next_proxy_random(self):
        proxies = [
            ProxyConfig(server="http://proxy1:8080"),
            ProxyConfig(server="http://proxy2:8080"),
        ]
        config = AntiBotConfig(
            proxies=proxies,
            proxy_rotation=ProxyRotationStrategy.RANDOM,
        )
        proxy = config.get_next_proxy()
        assert proxy.server in ["http://proxy1:8080", "http://proxy2:8080"]

    def test_should_retry_on_detection_captcha(self):
        config = AntiBotConfig()
        assert config.should_retry_on_detection("CAPTCHA detected") is True
        assert config.should_retry_on_detection("Please solve captcha") is True

    def test_should_retry_on_detection_blocked(self):
        config = AntiBotConfig()
        assert config.should_retry_on_detection("Access denied - blocked") is True
        assert config.should_retry_on_detection("403 Forbidden") is True

    def test_should_retry_on_detection_rate_limit(self):
        config = AntiBotConfig()
        assert config.should_retry_on_detection("Rate limit exceeded") is True
        assert config.should_retry_on_detection("429 Too Many Requests") is True

    def test_should_retry_on_detection_cloudflare(self):
        config = AntiBotConfig()
        assert config.should_retry_on_detection("Cloudflare protection") is True

    def test_should_not_retry_on_normal_error(self):
        config = AntiBotConfig()
        assert config.should_retry_on_detection("Network timeout") is False
        assert config.should_retry_on_detection("DNS resolution failed") is False


class TestFactoryFunctions:
    """Tests for factory functions."""

    def test_create_stealth_config(self):
        config = create_stealth_config()
        assert config.stealth_mode == StealthMode.FULL
        assert config.user_agent_mode == UserAgentMode.RANDOM
        assert config.simulate_human is True
        assert config.override_navigator is True

    def test_create_stealth_config_with_proxies(self):
        proxies = [ProxyConfig(server="http://proxy:8080")]
        config = create_stealth_config(proxies=proxies)
        assert config.proxy_rotation == ProxyRotationStrategy.ROUND_ROBIN

    def test_create_basic_config(self):
        config = create_basic_config()
        assert config.stealth_mode == StealthMode.BASIC
        assert config.user_agent_mode == UserAgentMode.STATIC

    def test_create_basic_config_with_proxy(self):
        proxy = ProxyConfig(server="http://proxy:8080")
        config = create_basic_config(proxy=proxy)
        assert config.proxy == proxy

    def test_create_config_stealth_true(self):
        config = create_config(stealth=True)
        assert config.stealth_mode == StealthMode.FULL
        assert config.user_agent_mode == UserAgentMode.RANDOM

    def test_create_config_with_proxies(self):
        config = create_config(
            stealth=True,
            proxies=[
                {"server": "http://proxy1:8080"},
                {"server": "http://proxy2:8080", "username": "user"},
            ],
        )
        assert len(config.proxies) == 2
        assert config.proxies[0].server == "http://proxy1:8080"
        assert config.proxies[1].username == "user"


class TestCrawl4AIIntegration:
    """Tests for crawl4ai BrowserConfig generation."""

    def test_to_browser_config_basic(self):
        """Test basic BrowserConfig generation without crawl4ai installed."""
        config = AntiBotConfig(
            stealth_mode=StealthMode.OFF,
            fingerprint=BrowserFingerprint(
                viewport_width=1280,
                viewport_height=720,
            ),
        )

        # This will fail if crawl4ai is not installed, which is expected
        try:
            from crawl4ai import BrowserConfig

            browser_config = config.to_browser_config(headless=True)
            assert isinstance(browser_config, BrowserConfig)
        except ImportError:
            pytest.skip("crawl4ai not installed")

    def test_to_browser_config_with_stealth(self):
        """Test BrowserConfig with stealth mode."""
        config = AntiBotConfig(
            stealth_mode=StealthMode.FULL,
            user_agent_mode=UserAgentMode.RANDOM,
        )

        try:
            from crawl4ai import BrowserConfig

            browser_config = config.to_browser_config(headless=False)
            assert isinstance(browser_config, BrowserConfig)
        except ImportError:
            pytest.skip("crawl4ai not installed")

    def test_to_crawler_run_config(self):
        """Test CrawlerRunConfig kwargs generation."""
        config = AntiBotConfig(
            stealth_mode=StealthMode.FULL,
            magic=True,
            delay_before_return_html=2.0,
        )
        run_config = config.to_crawler_run_config()

        assert run_config["simulate_user"] is True
        assert run_config["override_navigator"] is True
        assert run_config["magic"] is True
        assert run_config["delay_before_return_html"] == 2.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
