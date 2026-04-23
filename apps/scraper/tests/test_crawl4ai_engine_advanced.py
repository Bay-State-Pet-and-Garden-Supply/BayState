import pytest
from crawl4ai import CrawlerRunConfig
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
