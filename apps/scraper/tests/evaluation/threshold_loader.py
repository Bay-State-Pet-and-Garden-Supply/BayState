"""Threshold loader for evaluation configuration.

Loads and validates evaluation thresholds from YAML config file.
"""

import os
from pathlib import Path
from typing import Any, Dict

import yaml


def get_config_path() -> Path:
    """Get path to evaluation_thresholds.yaml config file."""
    # Navigate from tests/evaluation/ to config/
    current_dir = Path(__file__).parent
    scraper_root = current_dir.parent.parent
    config_path = scraper_root / "config" / "evaluation_thresholds.yaml"
    return config_path


def load_thresholds() -> Dict[str, Any]:
    """Load evaluation thresholds from config file.

    Returns:
        Dict containing all threshold values:
        - min_field_accuracy: float (0-1)
        - min_success_rate: float (0-1)
        - max_cost_per_sku: float (USD)
        - max_regression_pct: float (0-1)
        - required_fields: list[str]
        - statistical_confidence: float (0-1)

    Raises:
        FileNotFoundError: If config file not found
        ValueError: If required keys missing
    """
    config_path = get_config_path()

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    # Validate required keys
    required_keys = [
        "min_field_accuracy",
        "min_success_rate",
        "max_cost_per_sku",
        "max_regression_pct",
        "required_fields",
        "statistical_confidence",
    ]

    missing_keys = [key for key in required_keys if key not in config]
    if missing_keys:
        raise ValueError(f"Missing required threshold keys: {missing_keys}")

    return config


if __name__ == "__main__":
    # Quick test when run directly
    config = load_thresholds()
    print(f"Min accuracy: {config['min_field_accuracy']}")
    print(f"Max cost: ${config['max_cost_per_sku']}")
