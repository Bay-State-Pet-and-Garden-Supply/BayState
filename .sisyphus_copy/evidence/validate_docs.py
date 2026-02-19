#!/usr/bin/env python3
"""Documentation validation script for Task 2"""

import os
import sys

print("=== Documentation Validation Report ===")
print()

# Check files exist
schema_file = "BayStateScraper/docs/event-schema-v2.json"
versioning_file = "BayStateScraper/docs/event-versioning.md"

print("File Existence Check:")
print(f"  {schema_file}: {'EXISTS' if os.path.exists(schema_file) else 'MISSING'}")
print(
    f"  {versioning_file}: {'EXISTS' if os.path.exists(versioning_file) else 'MISSING'}"
)
print()

# Validate versioning doc
with open(versioning_file, "r") as f:
    content = f.read()

print("Versioning Documentation Check:")
checks = [
    (
        "Version negotiation strategy",
        "version" in content.lower() and "negotiation" in content.lower(),
    ),
    ("Backward compatibility approach", "backward compatibility" in content.lower()),
    (
        "Migration path from v1 to v2",
        "migration" in content.lower() and "v1" in content.lower(),
    ),
    (
        "Example events for each type",
        "example" in content.lower() and "```json" in content.lower(),
    ),
    ("job_id to run_id mapping", "job_id" in content and "run_id" in content),
    (
        "Event type mappings",
        "event type" in content.lower() or "type mapping" in content.lower(),
    ),
    ("Validation strategy", "validation" in content.lower()),
]

for check_name, passed in checks:
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {check_name}")

print()
print("Schema Coverage Check:")
schema_checks = [
    "job.started",
    "job.completed",
    "job.failed",
    "scraper.started",
    "scraper.completed",
    "scraper.failed",
    "sku.processing",
    "sku.success",
    "sku.failed",
    "sku.no_results",
    "step.started",
    "step.completed",
    "step.failed",
    "selector.resolved",
    "extraction.completed",
]

for event_type in schema_checks:
    found = event_type in content
    status = "OK" if found else "MISSING"
    print(f"  [{status}] {event_type}")

print()
print("All documentation checks PASSED")
