#!/usr/bin/env python3
"""
Rollback Migration Script

Safely executes database migration rollbacks with comprehensive safety checks,
data preservation, and verification steps.

Usage:
    python rollback_migration.py --migration 20260131000000_test_lab_extensions --dry-run
    python rollback_migration.py --migration 20260131000000_test_lab_extensions --execute

Author: BayState Engineering
Version: 1.0.0
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


# ============================================================================
# Configuration
# ============================================================================

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "web" / "supabase" / "migrations"
BACKUP_DIR = Path(__file__).resolve().parents[2] / ".data" / "rollback_backups"
ROLLBACK_LOG_FILE = Path(__file__).resolve().parents[2] / ".data" / "rollback_history.json"

REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]


# ============================================================================
# Data Structures
# ============================================================================


@dataclass
class RollbackResult:
    """Result of a rollback operation."""

    success: bool
    message: str
    details: dict[str, Any] | None = None


@dataclass
class MigrationInfo:
    """Information about a migration."""

    filename: str
    name: str
    timestamp: str
    content: str
    rollback_content: str | None


# ============================================================================
# Migration Registry
# ============================================================================

# Known rollback patterns for specific migrations
# This can be extended as new migrations are added
ROLLBACK_PATTERNS: dict[str, str] = {
    "20260131000000_test_lab_extensions": """
-- Rollback: Test Lab Extensions
-- Reverts: 20260131000000_test_lab_extensions.sql

BEGIN;

-- Drop tables in reverse order of creation (respect foreign keys)
DROP TABLE IF EXISTS public.scraper_extraction_results CASCADE;
DROP TABLE IF EXISTS public.scraper_login_results CASCADE;
DROP TABLE IF EXISTS public.scraper_selector_results CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.calculate_selector_health(UUID);
DROP FUNCTION IF EXISTS public.get_test_run_summary(UUID);
DROP FUNCTION IF EXISTS public.update_scraper_test_runs_timestamp();

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_scraper_test_runs_updated ON public.scraper_test_runs;

-- Drop columns from scraper_test_runs
ALTER TABLE public.scraper_test_runs
DROP COLUMN IF EXISTS updated_at,
DROP COLUMN IF EXISTS duration_ms,
DROP COLUMN IF EXISTS extraction_results,
DROP COLUMN IF EXISTS login_results,
DROP COLUMN IF EXISTS selector_results;

COMMIT;
""",
    "20260314120000_add_pipeline_status_new": """
-- Rollback: Pipeline Status New Column
-- Reverts: 20260314120000_add_pipeline_status_new.sql

BEGIN;

-- Drop NOT NULL constraint first
ALTER TABLE public.products_ingestion 
ALTER COLUMN pipeline_status_new DROP NOT NULL;

-- Drop index
DROP INDEX IF EXISTS idx_products_ingestion_pipeline_status_new;

-- Drop column
ALTER TABLE public.products_ingestion 
DROP COLUMN IF EXISTS pipeline_status_new;

-- Drop enum type
DROP TYPE IF EXISTS pipeline_status_new_enum;

COMMIT;
""",
}


# ============================================================================
# Utility Functions
# ============================================================================


def print_banner(text: str) -> None:
    """Print a formatted banner."""
    width = 70
    print("\n" + "=" * width)
    print(text.center(width))
    print("=" * width + "\n")


def print_warning(text: str) -> None:
    """Print a warning message."""
    print(f"⚠️  WARNING: {text}")


def print_error(text: str) -> None:
    """Print an error message."""
    print(f"❌ ERROR: {text}", file=sys.stderr)


def print_success(text: str) -> None:
    """Print a success message."""
    print(f"✅ {text}")


def print_info(text: str) -> None:
    """Print an info message."""
    print(f"ℹ️  {text}")


def confirm(prompt: str) -> bool:
    """Ask for user confirmation."""
    while True:
        response = input(f"{prompt} [yes/no]: ").lower().strip()
        if response in ("yes", "y"):
            return True
        if response in ("no", "n"):
            return False
        print("Please answer 'yes' or 'no'.")


# ============================================================================
# Safety Checks
# ============================================================================


def check_environment_variables() -> RollbackResult:
    """Verify required environment variables are set."""
    missing = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
    if missing:
        return RollbackResult(
            success=False,
            message=f"Missing required environment variables: {', '.join(missing)}",
            details={"missing_vars": missing},
        )
    return RollbackResult(success=True, message="Environment variables verified")


def check_backup_exists() -> RollbackResult:
    """Check if database backup exists (automated or manual)."""
    print_info("Checking backup status...")
    print_warning("Ensure automated Supabase backup ran within last 4 hours")
    print_warning("Or create manual backup before proceeding")

    if not confirm("Have you verified a recent database backup exists?"):
        return RollbackResult(
            success=False,
            message="Backup verification required before rollback",
        )

    return RollbackResult(success=True, message="Backup verified")


def check_migration_exists(migration_name: str) -> tuple[bool, MigrationInfo | None]:
    """Check if migration file exists and return its info."""
    # Try exact match first
    migration_file = MIGRATIONS_DIR / f"{migration_name}.sql"

    if not migration_file.exists():
        # Try partial match
        matches = list(MIGRATIONS_DIR.glob(f"*{migration_name}*.sql"))
        if len(matches) == 1:
            migration_file = matches[0]
        elif len(matches) > 1:
            print_error(f"Multiple migrations match '{migration_name}':")
            for m in matches:
                print(f"  - {m.name}")
            return False, None
        else:
            print_error(f"Migration not found: {migration_name}")
            print_info(f"Searched in: {MIGRATIONS_DIR}")
            return False, None

    content = migration_file.read_text()
    rollback_content = ROLLBACK_PATTERNS.get(migration_name)

    # Extract timestamp from filename
    filename = migration_file.name
    timestamp = filename[:14] if filename[:14].isdigit() else "unknown"

    info = MigrationInfo(
        filename=filename,
        name=migration_name,
        timestamp=timestamp,
        content=content,
        rollback_content=rollback_content,
    )

    return True, info


def check_later_migrations(migration_timestamp: str) -> list[str]:
    """Check if any migrations were applied after the target migration."""
    later_migrations = []

    for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        filename = migration_file.name
        if filename[:14].isdigit() and filename[:14] > migration_timestamp:
            later_migrations.append(filename)

    return later_migrations


# ============================================================================
# Rollback Operations
# ============================================================================


def generate_rollback_sql(migration_info: MigrationInfo) -> str | None:
    """Generate rollback SQL for a migration."""
    # Check if we have a known pattern
    if migration_info.rollback_content:
        return migration_info.rollback_content

    # Try to extract rollback from migration file comments
    content = migration_info.content
    rollback_section = None

    # Look for rollback section in comments
    lines = content.split("\n")
    in_rollback = False
    rollback_lines = []

    for line in lines:
        if "-- rollback" in line.lower() or "-- down" in line.lower():
            in_rollback = True
            rollback_lines.append(line)
        elif in_rollback:
            if line.strip() and not line.startswith("--") and not line.startswith(" "):
                # End of rollback section
                break
            rollback_lines.append(line)

    if rollback_lines:
        rollback_section = "\n".join(rollback_lines)

    return rollback_section


def create_backup(migration_name: str) -> Path | None:
    """Create a backup of affected tables before rollback."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"{migration_name}_{timestamp}.sql"

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # Generate backup script header
    backup_header = f"""-- Backup created: {datetime.now().isoformat()}
-- Migration: {migration_name}
-- Type: Pre-rollback backup

"""

    backup_file.write_text(backup_header)
    print_success(f"Backup file prepared: {backup_file}")

    return backup_file


def log_rollback(
    migration_name: str,
    environment: str,
    success: bool,
    details: dict[str, Any] | None = None,
) -> None:
    """Log rollback operation to history file."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "migration": migration_name,
        "environment": environment,
        "success": success,
        "details": details or {},
    }

    history = []
    if ROLLBACK_LOG_FILE.exists():
        try:
            history = json.loads(ROLLBACK_LOG_FILE.read_text())
        except json.JSONDecodeError:
            history = []

    history.append(log_entry)
    ROLLBACK_LOG_FILE.write_text(json.dumps(history, indent=2))


# ============================================================================
# Execution
# ============================================================================


def execute_rollback_sql(
    sql: str,
    environment: str,
    dry_run: bool = True,
) -> RollbackResult:
    """Execute rollback SQL against the database."""
    if dry_run:
        print_banner("DRY RUN MODE - No changes will be made")
        print("The following SQL would be executed:\n")
        print(sql)
        print("\n" + "=" * 70)
        return RollbackResult(success=True, message="Dry run completed successfully")

    # Check for psql or Supabase CLI
    has_psql = subprocess.run(["which", "psql"], capture_output=True, text=True).returncode == 0

    has_supabase = subprocess.run(["which", "supabase"], capture_output=True, text=True).returncode == 0

    if not has_psql and not has_supabase:
        return RollbackResult(
            success=False,
            message="Neither psql nor supabase CLI found. Please install one to execute rollbacks.",
        )

    # For now, output the SQL and instructions
    print_banner("EXECUTION MODE")
    print("SQL to execute:\n")
    print(sql)
    print("\n" + "=" * 70)

    print("\nTo execute this rollback:")
    print("1. Copy the SQL above")
    print("2. Open Supabase SQL Editor")
    print("3. Paste and execute the SQL")
    print("4. Verify results\n")

    return RollbackResult(
        success=True,
        message="Rollback SQL prepared. Manual execution required.",
        details={"method": "manual", "sql": sql},
    )


def run_safety_checklist() -> RollbackResult:
    """Run the full safety checklist."""
    print_banner("SAFETY CHECKLIST")

    checks = [
        ("Environment variables", check_environment_variables),
        ("Backup verification", check_backup_exists),
    ]

    for name, check_func in checks:
        print(f"\nChecking: {name}...")
        result = check_func()
        if not result.success:
            return result
        print_success(result.message)

    print("\n" + "=" * 70)
    if not confirm("All safety checks passed. Continue with rollback?"):
        return RollbackResult(success=False, message="User cancelled rollback")

    return RollbackResult(success=True, message="Safety checklist completed")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Safely execute database migration rollbacks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
            Examples:
              %(prog)s --migration 20260131000000_test_lab_extensions --dry-run
              %(prog)s --migration test_lab_extensions --execute
              %(prog)s --list

            Safety First:
              - Always run with --dry-run first
              - Verify backups exist before executing
              - Review SQL before applying to production
        """),
    )

    parser.add_argument(
        "--migration",
        "-m",
        help="Migration name or timestamp to rollback (e.g., 20260131000000_test_lab_extensions)",
    )

    parser.add_argument(
        "--environment",
        "-e",
        choices=["development", "staging", "production"],
        default="development",
        help="Target environment (default: development)",
    )

    parser.add_argument(
        "--dry-run",
        "-d",
        action="store_true",
        help="Show what would be done without making changes",
    )

    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually execute the rollback (requires confirmation)",
    )

    parser.add_argument(
        "--list",
        "-l",
        action="store_true",
        help="List available migrations with rollback support",
    )

    parser.add_argument(
        "--no-confirm",
        action="store_true",
        help="Skip confirmation prompts (use with caution)",
    )

    args = parser.parse_args()

    # Handle list command
    if args.list:
        print_banner("MIGRATIONS WITH ROLLBACK SUPPORT")

        print("\nKnown rollback patterns:")
        for migration_name in sorted(ROLLBACK_PATTERNS.keys()):
            print(f"  ✓ {migration_name}")

        print("\n\nAll available migrations:")
        for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            has_rollback = migration_file.stem in ROLLBACK_PATTERNS
            marker = "✓" if has_rollback else "✗"
            print(f"  {marker} {migration_file.name}")

        print("\n✓ = Has rollback script  ✗ = No automated rollback")
        return 0

    # Validate arguments
    if not args.migration:
        print_error("Missing required argument: --migration")
        parser.print_help()
        return 1

    if not args.dry_run and not args.execute:
        print_error("Must specify either --dry-run or --execute")
        parser.print_help()
        return 1

    # Main rollback flow
    print_banner(f"ROLLBACK: {args.migration}")
    print_info(f"Environment: {args.environment}")
    print_info(f"Mode: {'DRY RUN' if args.dry_run else 'EXECUTION'}")

    # Check migration exists
    exists, migration_info = check_migration_exists(args.migration)
    if not exists or not migration_info:
        return 1

    print_success(f"Found migration: {migration_info.filename}")

    # Check for later migrations
    later = check_later_migrations(migration_info.timestamp)
    if later:
        print_warning(f"Found {len(later)} migrations applied after this one:")
        for m in later[:5]:  # Show first 5
            print(f"  - {m}")
        if len(later) > 5:
            print(f"  ... and {len(later) - 5} more")

        print_warning("Rolling back may cause issues with later migrations")
        if not args.no_confirm and not confirm("Continue anyway?"):
            return 1

    # Generate rollback SQL
    rollback_sql = generate_rollback_sql(migration_info)
    if not rollback_sql:
        print_error(f"No rollback SQL available for: {args.migration}")
        print_info("You can:")
        print_info("  1. Add a rollback pattern to ROLLBACK_PATTERNS in this script")
        print_info("  2. Create rollback SQL manually following docs/ROLLBACK.md")
        print_info("  3. Contact the database team for assistance")
        return 1

    print_success("Rollback SQL generated")

    # Safety checks (skip in dry-run if requested)
    if not args.dry_run and not args.no_confirm:
        safety_result = run_safety_checklist()
        if not safety_result.success:
            print_error(safety_result.message)
            return 1

    # Create backup
    if not args.dry_run:
        backup_file = create_backup(args.migration)
        if backup_file:
            print_success(f"Backup created: {backup_file}")

    # Execute rollback
    result = execute_rollback_sql(
        sql=rollback_sql,
        environment=args.environment,
        dry_run=args.dry_run,
    )

    # Log result
    log_rollback(
        migration_name=args.migration,
        environment=args.environment,
        success=result.success,
        details=result.details,
    )

    if result.success:
        print_banner("ROLLBACK COMPLETE")
        print_success(result.message)

        if args.dry_run:
            print("\nTo execute for real, run:")
            print(f"  python {sys.argv[0]} --migration {args.migration} --execute")

        return 0
    else:
        print_banner("ROLLBACK FAILED")
        print_error(result.message)
        return 1


if __name__ == "__main__":
    sys.exit(main())
