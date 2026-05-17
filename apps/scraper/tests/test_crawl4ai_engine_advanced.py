from src.crawl4ai_engine.engine import Crawl4AIEngine

def test_crawl4ai_engine_config_propagation():
    config = {
        "crawler": {
            "delay_before_return_html": 2000,
            "target_elements": ["main", "article"],
            "wait_until": "load",
            "excluded_tags": ["nav", "form"]
        }
    }
    engine = Crawl4AIEngine(config)
    run_config = engine._build_run_config()
    
    assert run_config.delay_before_return_html == 2000.0
    assert run_config.target_elements == ["main", "article"]
    assert run_config.wait_until == "load"
    assert "form" in run_config.excluded_tags

def test_crawl4ai_engine_defaults():
    config = {}
    engine = Crawl4AIEngine(config)
    run_config = engine._build_run_config()
    
    assert run_config.wait_until == "networkidle"
    assert "form" in run_config.excluded_tags

def test_crawl4ai_engine_rendering_optimization_propagation():
    config = {
        "browser": {
            "text_mode": True,
            "light_mode": True,
            "avoid_ads": True,
            "avoid_css": True,
        }
    }
    engine = Crawl4AIEngine(config)
    browser_config = engine._browser_config
    
    assert browser_config.text_mode is True
    assert browser_config.light_mode is True
    assert browser_config.avoid_ads is True
    assert browser_config.avoid_css is True

def test_crawl4ai_engine_config_object_propagation():
    from src.crawl4ai_engine.types import EngineConfig
    config = EngineConfig(
        text_mode=True,
        light_mode=True,
        avoid_ads=True,
        avoid_css=True,
    )
    engine = Crawl4AIEngine(config)
    browser_config = engine._browser_config
    
    assert browser_config.text_mode is True
    assert browser_config.light_mode is True
    assert browser_config.avoid_ads is True
    assert browser_config.avoid_css is True

