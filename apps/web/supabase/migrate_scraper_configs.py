#!/usr/bin/env python3
"""
Migrate scraper configs from BayStateScraper YAML files to the new database schema.
Run this from the BayStateApp directory.
"""

import json
import os
import sys
from pathlib import Path

import yaml
from supabase import create_client, Client

# Add BayStateScraper to path
BAYSTATE_SCRAPER_PATH = (
    Path(__file__).parent / "BayStateScraper" / "scrapers" / "configs"
)


def load_yaml_config(filepath: Path) -> dict:
    """Load and parse a YAML scraper config file."""
    with open(filepath, "r") as f:
        return yaml.safe_load(f)


def convert_yaml_to_new_format(yaml_config: dict) -> dict:
    """Convert old YAML format to new JSON format."""
    # Build selectors array
    selectors = []
    for sel in yaml_config.get("selectors", []):
        selectors.append(
            {
                "id": f"sel-{sel.get('name', '').lower().replace(' ', '-')}",
                "name": sel.get("name"),
                "selector": sel.get("selector"),
                "attribute": sel.get("attribute", "text"),
                "multiple": sel.get("multiple", False),
                "required": sel.get("required", True),
            }
        )

    # Build workflows array
    workflows = []
    for step in yaml_config.get("workflows", []):
        workflow_step = {"action": step.get("action"), "params": step.get("params", {})}
        workflows.append(workflow_step)

    # Build the new config
    new_config = {
        "schema_version": "1.0",
        "name": yaml_config.get("name"),
        "display_name": yaml_config.get("name", "").replace("-", " ").title(),
        "base_url": yaml_config.get("base_url"),
        "selectors": selectors,
        "workflows": workflows,
        "timeout": yaml_config.get("timeout", 30),
        "retries": yaml_config.get("retries", 3),
        "image_quality": yaml_config.get("image_quality", 50),
        "test_skus": yaml_config.get("test_skus", []),
        "fake_skus": yaml_config.get("fake_skus", []),
        "edge_case_skus": yaml_config.get("edge_case_skus", []),
        "anti_detection": yaml_config.get("anti_detection", {}),
        "validation": yaml_config.get("validation", {}),
    }

    # Add login if present
    if yaml_config.get("login"):
        new_config["login"] = yaml_config.get("login")

    return new_config


def main():
    # Check for required env vars
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print(
            "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        )
        sys.exit(1)

    # Connect to Supabase
    supabase: Client = create_client(supabase_url, supabase_key)

    # Check if BayStateScraper exists
    if not BAYSTATE_SCRAPER_PATH.exists():
        print(f"ERROR: BayStateScraper configs not found at {BAYSTATE_SCRAPER_PATH}")
        print("Please clone BayStateScraper repo to the parent directory")
        sys.exit(1)

    # Load all YAML configs
    yaml_files = list(BAYSTATE_SCRAPER_PATH.glob("*.yaml"))
    print(f"Found {len(yaml_files)} YAML config files")

    for yaml_file in sorted(yaml_files):
        print(f"\nProcessing {yaml_file.name}...")

        try:
            yaml_config = load_yaml_config(yaml_file)
            new_config = convert_yaml_to_new_format(yaml_config)

            name = yaml_config.get("name")
            slug = name.lower().replace(" ", "-")

            # Check if config already exists
            existing = (
                supabase.table("scraper_configs")
                .select("id")
                .eq("slug", slug)
                .execute()
            )

            if existing.data:
                config_id = existing.data[0]["id"]
                print(f"  Updating existing config: {slug}")

                # Update scraper_config_versions with full config
                supabase.table("scraper_config_versions").update(
                    {
                        "config": new_config,
                        "status": "published",
                        "change_summary": f"Migrated full config from BayStateScraper YAML",
                    }
                ).eq("config_id", config_id).eq("status", "published").execute()
            else:
                print(f"  Creating new config: {slug}")

            print(f"  ✓ Config converted successfully")
            print(f"    - Selectors: {len(new_config.get('selectors', []))}")
            print(f"    - Workflow steps: {len(new_config.get('workflows', []))}")

        except Exception as e:
            print(f"  ERROR: {e}")

    print("\n✓ Migration complete!")


if __name__ == "__main__":
    main()
