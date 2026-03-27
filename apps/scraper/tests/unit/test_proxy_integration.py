from utils.proxy_rotator import ProxyRotator


def test_per_request_rotation():
    """Test that per_request strategy rotates through proxies."""
    rotator = ProxyRotator(["http://p1:8080", "http://p2:8080"], strategy="per_request", failure_cooldown=1)
    assert rotator.get_proxy() == "http://p1:8080"
    assert rotator.get_proxy() == "http://p2:8080"
    assert rotator.get_proxy() == "http://p1:8080"  # cycles back


def test_per_site_consistency():
    """Test that per_site strategy returns same proxy for same site."""
    rotator = ProxyRotator(["http://p1:8080", "http://p2:8080"], strategy="per_site", failure_cooldown=1)
    site = "amazon.com"
    proxy1 = rotator.get_proxy(site)
    proxy2 = rotator.get_proxy(site)
    assert proxy1 == proxy2


def test_off_strategy():
    """Test that off strategy always returns first proxy."""
    rotator = ProxyRotator(["http://p1:8080", "http://p2:8080"], strategy="off", failure_cooldown=1)
    assert rotator.get_proxy() == "http://p1:8080"
    assert rotator.get_proxy() == "http://p1:8080"


def test_mark_failed_excludes_proxy():
    """Test that failed proxy is excluded from rotation."""
    rotator = ProxyRotator(["http://p1:8080", "http://p2:8080"], strategy="per_request", failure_cooldown=1)
    rotator.mark_failed("http://p1:8080")
    # Should only return p2 since p1 is failed
    assert rotator.get_proxy() == "http://p2:8080"
    # p1 is still in cooldown, so p2 remains the only healthy proxy
    assert rotator.get_proxy() == "http://p2:8080"


def test_from_proxy_config():
    """Test creating rotator from ProxyConfig."""
    from scrapers.models.config import ScraperConfig

    config = ScraperConfig.ProxyConfig(
        proxy_url="http://proxy:8080",
        rotation_strategy="per_request",
    )
    rotator = ProxyRotator.from_proxy_config(config)
    assert rotator.get_proxy() == "http://proxy:8080"
