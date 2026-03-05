"""Configuration loading for Crawl4AI Engine."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from crawl4ai_engine.types import CrawlConfig, EngineConfig


class ConfigLoader:
    """Load and parse YAML configuration files for crawl4ai engine."""

    @staticmethod
    def load_from_yaml(file_path: str | Path) -> dict[str, Any]:
        """Load configuration from a YAML file.

        Args:
            file_path: Path to the YAML configuration file.

        Returns:
            Dictionary containing parsed configuration.

        Raises:
            FileNotFoundError: If the config file doesn't exist.
            yaml.YAMLError: If the YAML is invalid.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {file_path}")

        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    @staticmethod
    def load_crawl_config(config_dict: dict[str, Any]) -> CrawlConfig:
        """Load CrawlConfig from a dictionary.

        Args:
            config_dict: Dictionary containing crawl configuration.

        Returns:
            CrawlConfig instance.
        """
        return CrawlConfig(
            name=config_dict.get("name", "default"),
            url=config_dict.get("url", config_dict.get("base_url", "")),
            timeout=config_dict.get("timeout", 30),
            wait_for=config_dict.get("wait_for"),
            css_selector=config_dict.get("css_selector"),
            js_enabled=config_dict.get("js_enabled", True),
            headless=config_dict.get("headless", True),
            user_agent=config_dict.get("user_agent"),
            proxy=config_dict.get("proxy"),
            wait_until=config_dict.get("wait_until", "networkidle"),
            extract_text=config_dict.get("extract_text", True),
            extract_html=config_dict.get("extract_html", False),
            extract_links=config_dict.get("extract_links", False),
            schema=config_dict.get("schema"),
        )

    @staticmethod
    def load_engine_config(config_dict: dict[str, Any]) -> EngineConfig:
        """Load EngineConfig from a dictionary.

        Args:
            config_dict: Dictionary containing engine configuration.

        Returns:
            EngineConfig instance.
        """
        crawl4ai_config = config_dict.get("crawl4ai_config", {})

        return EngineConfig(
            headless=crawl4ai_config.get("headless", True),
            browser_type=crawl4ai_config.get("browser_type", "chromium"),
            timeout=crawl4ai_config.get("timeout", 30),
            max_concurrent_crawls=crawl4ai_config.get("max_concurrent_crawls", 5),
            enable_retry=crawl4ai_config.get("enable_retry", False),
            max_retries=crawl4ai_config.get("max_retries", 3),
            retry_delay=crawl4ai_config.get("retry_delay", 1.0),
            memory_limit_mb=crawl4ai_config.get("memory_limit_mb"),
            cpu_limit_percent=crawl4ai_config.get("cpu_limit_percent"),
            verbose=crawl4ai_config.get("verbose", False),
            log_requests=crawl4ai_config.get("log_requests", False),
            user_agent=crawl4ai_config.get("user_agent"),
            proxy=crawl4ai_config.get("proxy"),
            extra_browser_args=crawl4ai_config.get("extra_browser_args", []),
        )

    @classmethod
    def load_from_file(cls, file_path: str | Path) -> tuple[CrawlConfig, EngineConfig]:
        """Load both CrawlConfig and EngineConfig from a YAML file.

        Args:
            file_path: Path to the YAML configuration file.

        Returns:
            Tuple of (CrawlConfig, EngineConfig).
        """
        config_dict = cls.load_from_yaml(file_path)
        crawl_config = cls.load_crawl_config(config_dict)
        engine_config = cls.load_engine_config(config_dict)
        return crawl_config, engine_config

    @classmethod
    def find_config_in_dir(cls, config_dir: str | Path, name: str) -> Path | None:
        """Find a config file by name in a directory.

        Args:
            config_dir: Directory to search.
            name: Config name (without extension).

        Returns:
            Path to config file if found, None otherwise.
        """
        config_path = Path(config_dir)
        if not config_path.exists():
            return None

        # Try different extensions
        for ext in [".yaml", ".yml"]:
            candidate = config_path / f"{name}{ext}"
            if candidate.exists():
                return candidate

        return None


def load_config(
    config_path: str | Path | None = None,
    config_dir: str | Path | None = None,
    name: str | None = None,
) -> tuple[CrawlConfig, EngineConfig]:
    """Convenience function to load crawl configuration.

    Args:
        config_path: Direct path to config file.
        config_dir: Directory to search for config.
        name: Config name to search for in config_dir.

    Returns:
        Tuple of (CrawlConfig, EngineConfig).
    """
    loader = ConfigLoader()

    if config_path:
        return loader.load_from_file(config_path)

    if config_dir and name:
        path = loader.find_config_in_dir(config_dir, name)
        if path:
            return loader.load_from_file(path)
        msg = f"Config '{name}' not found in {config_dir}"
        raise FileNotFoundError(msg)

    msg = "Either config_path or (config_dir and name) must be provided"
    raise ValueError(msg)


__all__ = ["ConfigLoader", "load_config", "CrawlConfig", "EngineConfig"]
