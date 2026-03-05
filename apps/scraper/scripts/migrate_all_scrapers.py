#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, cast

import yaml


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_DIR = PROJECT_ROOT / "scrapers" / "configs"
DEFAULT_STATE_FILE = PROJECT_ROOT / ".sisyphus" / "state" / "crawl4ai_migration_state.json"
DEFAULT_REPORT_DIR = PROJECT_ROOT / ".sisyphus" / "evidence" / "migration-reports"

PHASE_TARGETS: dict[int, int] = {1: 3, 2: 4, 3: 4, 4: 1}
PHASE_PREFERENCES: dict[int, list[str]] = {
    1: ["4health", "baystatepet", "coastal"],
    2: ["central_pet", "mazuri", "phillips", "orgill"],
    3: ["amazon", "walmart", "petfoodex", "bradley"],
    4: ["ai_template"],
}

LOW_RISK: set[str] = {"4health", "baystatepet", "coastal", "ai_coastal", "ai_mazuri", "ai_template"}
HIGH_RISK: set[str] = {"amazon", "walmart", "petfoodex", "bradley", "ai_amazon", "ai_walmart"}

Risk = Literal["low", "medium", "high"]
Status = Literal["pending", "migrated", "rolled_back"]
Engine = Literal["legacy", "crawl4ai"]


@dataclass
class HistoryEvent:
    at: str
    action: str
    details: str


@dataclass
class ScraperState:
    name: str
    display_name: str
    config_path: str
    phase: int
    risk: Risk
    status: Status
    current_engine: Engine
    migrated_at: str | None
    rolled_back_at: str | None
    config_present: bool
    history: list[HistoryEvent]


@dataclass
class MigrationState:
    version: int
    created_at: str
    updated_at: str
    config_directory: str
    scrapers: dict[str, ScraperState]
    reports: list[str]


@dataclass
class DiscoveredScraper:
    key: str
    name: str
    display_name: str
    config_path: str
    risk: Risk


@dataclass
class PhaseSummary:
    total: int
    migrated: int
    rolled_back: int
    pending: int


@dataclass
class Summary:
    total: int
    pending: int
    migrated: int
    rolled_back: int
    phase_progress: dict[int, PhaseSummary]


@dataclass
class CliOptions:
    config_dir: Path
    state_file: Path
    report_dir: Path


@dataclass
class StatusCommand:
    output_json: bool


@dataclass
class MigrateBatchCommand:
    phase: int


@dataclass
class RollbackCommand:
    scraper: str
    reason: str


@dataclass
class VerifyCommand:
    pass


Command = StatusCommand | MigrateBatchCommand | RollbackCommand | VerifyCommand


@dataclass
class CliRequest:
    options: CliOptions
    command: Command


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path.resolve())


def normalize(value: str) -> str:
    text = value.strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    aliases = {
        "ai_central_pet": "ai_central_pet",
        "ai_central_pet_product_extractor": "ai_central_pet",
        "ai_coastal_pet_product_extractor": "ai_coastal",
        "ai_mazuri_product_extractor": "ai_mazuri",
        "ai_amazon_product_extractor": "ai_amazon",
        "ai_walmart_product_extractor": "ai_walmart",
        "bay_state_pet_live_site": "baystatepet",
    }
    return aliases.get(text, text)


def infer_risk(scraper_key: str) -> Risk:
    if scraper_key in LOW_RISK:
        return "low"
    if scraper_key in HIGH_RISK:
        return "high"
    return "medium"


def as_dict(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None

    raw = cast(dict[object, object], value)
    result: dict[str, object] = {}
    for key, item in raw.items():
        if isinstance(key, str):
            result[key] = item
    return result


def as_list(value: object) -> list[object] | None:
    if isinstance(value, list):
        raw = cast(list[object], value)
        return list(raw)
    return None


def as_str(value: object) -> str | None:
    if isinstance(value, str):
        return value
    return None


def as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def as_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def as_optional_str(value: object) -> str | None:
    if value is None:
        return None
    return as_str(value)


def as_risk(value: object) -> Risk | None:
    if value == "low":
        return "low"
    if value == "medium":
        return "medium"
    if value == "high":
        return "high"
    return None


def as_status(value: object) -> Status | None:
    if value == "pending":
        return "pending"
    if value == "migrated":
        return "migrated"
    if value == "rolled_back":
        return "rolled_back"
    return None


def as_engine(value: object) -> Engine | None:
    if value == "legacy":
        return "legacy"
    if value == "crawl4ai":
        return "crawl4ai"
    return None


def read_yaml(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        loaded = cast(object, yaml.safe_load(handle))
    payload = as_dict(loaded)
    if payload is None:
        return {}
    return payload


def discover_scrapers(config_dir: Path) -> list[DiscoveredScraper]:
    if not config_dir.exists():
        return []

    discovered: list[DiscoveredScraper] = []
    for config_path in sorted(config_dir.glob("*.yaml")):
        payload = read_yaml(config_path)
        raw_name = as_str(payload.get("name")) or config_path.stem
        display_name = as_str(payload.get("display_name")) or raw_name
        scraper_key = normalize(raw_name)
        discovered.append(
            DiscoveredScraper(
                key=scraper_key,
                name=raw_name,
                display_name=display_name,
                config_path=relative_path(config_path),
                risk=infer_risk(scraper_key),
            )
        )

    return discovered


def risk_rank(risk: Risk) -> int:
    if risk == "low":
        return 0
    if risk == "medium":
        return 1
    return 2


def assign_phases(scrapers: list[DiscoveredScraper]) -> dict[str, int]:
    by_key: dict[str, DiscoveredScraper] = {item.key: item for item in scrapers}
    remaining: set[str] = set(by_key.keys())
    assignments: dict[str, int] = {}

    def take_preferred(phase: int, capacity: int) -> list[str]:
        picked: list[str] = []
        for preferred in PHASE_PREFERENCES.get(phase, []):
            if preferred in remaining:
                picked.append(preferred)
                remaining.remove(preferred)
            if len(picked) >= capacity:
                break
        return picked

    phase_1 = take_preferred(1, PHASE_TARGETS[1])
    if len(phase_1) < PHASE_TARGETS[1]:
        ordered = sorted(remaining, key=lambda key: (risk_rank(by_key[key].risk), key))
        for key in ordered:
            phase_1.append(key)
            remaining.remove(key)
            if len(phase_1) >= PHASE_TARGETS[1]:
                break

    phase_2 = take_preferred(2, PHASE_TARGETS[2])
    if len(phase_2) < PHASE_TARGETS[2]:
        ordered = sorted(remaining, key=lambda key: (abs(risk_rank(by_key[key].risk) - 1), key))
        for key in ordered:
            phase_2.append(key)
            remaining.remove(key)
            if len(phase_2) >= PHASE_TARGETS[2]:
                break

    phase_3 = take_preferred(3, PHASE_TARGETS[3])
    if len(phase_3) < PHASE_TARGETS[3]:
        ordered = sorted(remaining, key=lambda key: (-risk_rank(by_key[key].risk), key))
        for key in ordered:
            phase_3.append(key)
            remaining.remove(key)
            if len(phase_3) >= PHASE_TARGETS[3]:
                break

    phase_4 = take_preferred(4, PHASE_TARGETS[4])
    if len(phase_4) < PHASE_TARGETS[4]:
        ordered = sorted(remaining)
        for key in ordered:
            phase_4.append(key)
            remaining.remove(key)
            if len(phase_4) >= PHASE_TARGETS[4]:
                break

    for key in phase_1:
        assignments[key] = 1
    for key in phase_2:
        assignments[key] = 2
    for key in phase_3:
        assignments[key] = 3
    for key in phase_4:
        assignments[key] = 4
    for key in sorted(remaining):
        assignments[key] = 4

    return assignments


def to_history_event(payload: object) -> HistoryEvent | None:
    source = as_dict(payload)
    if source is None:
        return None
    at = as_str(source.get("at"))
    action = as_str(source.get("action"))
    details = as_str(source.get("details"))
    if at is None or action is None or details is None:
        return None
    return HistoryEvent(at=at, action=action, details=details)


def to_scraper_state(payload: object) -> ScraperState | None:
    source = as_dict(payload)
    if source is None:
        return None

    name = as_str(source.get("name"))
    display_name = as_str(source.get("display_name"))
    config_path = as_str(source.get("config_path"))
    phase = as_int(source.get("phase"))
    risk = as_risk(source.get("risk"))
    status = as_status(source.get("status"))
    current_engine = as_engine(source.get("current_engine"))
    migrated_at = as_optional_str(source.get("migrated_at"))
    rolled_back_at = as_optional_str(source.get("rolled_back_at"))
    config_present = as_bool(source.get("config_present"))

    history_items = as_list(source.get("history")) or []
    history: list[HistoryEvent] = []
    for item in history_items:
        event = to_history_event(item)
        if event is not None:
            history.append(event)

    if name is None:
        return None
    if display_name is None:
        return None
    if config_path is None:
        return None
    if phase is None:
        return None
    if risk is None:
        return None
    if status is None:
        return None
    if current_engine is None:
        return None
    if config_present is None:
        return None

    return ScraperState(
        name=name,
        display_name=display_name,
        config_path=config_path,
        phase=phase,
        risk=risk,
        status=status,
        current_engine=current_engine,
        migrated_at=migrated_at,
        rolled_back_at=rolled_back_at,
        config_present=config_present,
        history=history,
    )


def to_migration_state(payload: object) -> MigrationState | None:
    source = as_dict(payload)
    if source is None:
        return None

    version = as_int(source.get("version"))
    created_at = as_str(source.get("created_at"))
    updated_at = as_str(source.get("updated_at"))
    config_directory = as_str(source.get("config_directory"))
    scraper_items = as_dict(source.get("scrapers")) or {}
    report_items = as_list(source.get("reports")) or []

    if version is None:
        return None
    if created_at is None:
        return None
    if updated_at is None:
        return None
    if config_directory is None:
        return None

    scrapers: dict[str, ScraperState] = {}
    for key, value in scraper_items.items():
        parsed = to_scraper_state(value)
        if parsed is not None:
            scrapers[key] = parsed

    reports: list[str] = []
    for item in report_items:
        report = as_str(item)
        if report is not None:
            reports.append(report)

    return MigrationState(
        version=version,
        created_at=created_at,
        updated_at=updated_at,
        config_directory=config_directory,
        scrapers=scrapers,
        reports=reports,
    )


def history_event_to_json(event: HistoryEvent) -> dict[str, object]:
    return {"at": event.at, "action": event.action, "details": event.details}


def scraper_state_to_json(state: ScraperState) -> dict[str, object]:
    return {
        "name": state.name,
        "display_name": state.display_name,
        "config_path": state.config_path,
        "phase": state.phase,
        "risk": state.risk,
        "status": state.status,
        "current_engine": state.current_engine,
        "migrated_at": state.migrated_at,
        "rolled_back_at": state.rolled_back_at,
        "config_present": state.config_present,
        "history": [history_event_to_json(event) for event in state.history],
    }


def migration_state_to_json(state: MigrationState) -> dict[str, object]:
    return {
        "version": state.version,
        "created_at": state.created_at,
        "updated_at": state.updated_at,
        "config_directory": state.config_directory,
        "scrapers": {key: scraper_state_to_json(value) for key, value in state.scrapers.items()},
        "reports": list(state.reports),
    }


def default_state(config_dir: Path) -> MigrationState:
    timestamp = now_iso()
    return MigrationState(
        version=1,
        created_at=timestamp,
        updated_at=timestamp,
        config_directory=relative_path(config_dir),
        scrapers={},
        reports=[],
    )


def new_scraper_state(scraper: DiscoveredScraper, phase: int) -> ScraperState:
    return ScraperState(
        name=scraper.name,
        display_name=scraper.display_name,
        config_path=scraper.config_path,
        phase=phase,
        risk=scraper.risk,
        status="pending",
        current_engine="legacy",
        migrated_at=None,
        rolled_back_at=None,
        config_present=True,
        history=[HistoryEvent(at=now_iso(), action="discovered", details="Discovered in scrapers/configs")],
    )


def load_state(state_file: Path) -> MigrationState | None:
    if not state_file.exists():
        return None
    with state_file.open("r", encoding="utf-8") as handle:
        loaded = cast(object, json.load(handle))
    return to_migration_state(loaded)


def save_state(state_file: Path, state: MigrationState) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    payload = migration_state_to_json(state)
    with state_file.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def ensure_state(config_dir: Path, state_file: Path) -> MigrationState:
    state = load_state(state_file) or default_state(config_dir)
    state.config_directory = relative_path(config_dir)

    discovered = discover_scrapers(config_dir)
    phase_map = assign_phases(discovered)
    present_keys: set[str] = set()

    for scraper in discovered:
        key = scraper.key
        present_keys.add(key)
        phase = phase_map.get(key, 4)
        existing = state.scrapers.get(key)

        if existing is None:
            state.scrapers[key] = new_scraper_state(scraper, phase)
            continue

        existing.name = scraper.name
        existing.display_name = scraper.display_name
        existing.config_path = scraper.config_path
        existing.phase = phase
        existing.risk = scraper.risk
        existing.config_present = True

    for key, scraper in state.scrapers.items():
        if key not in present_keys:
            scraper.config_present = False

    state.updated_at = now_iso()
    return state


def add_event(scraper: ScraperState, action: str, details: str) -> None:
    scraper.history.append(HistoryEvent(at=now_iso(), action=action, details=details))


def build_summary(state: MigrationState) -> Summary:
    total = len(state.scrapers)
    pending = sum(1 for item in state.scrapers.values() if item.status == "pending")
    migrated = sum(1 for item in state.scrapers.values() if item.status == "migrated")
    rolled_back = sum(1 for item in state.scrapers.values() if item.status == "rolled_back")

    progress: dict[int, PhaseSummary] = {}
    for phase in (1, 2, 3, 4):
        phase_scrapers = [item for item in state.scrapers.values() if item.phase == phase]
        progress[phase] = PhaseSummary(
            total=len(phase_scrapers),
            migrated=sum(1 for item in phase_scrapers if item.status == "migrated"),
            rolled_back=sum(1 for item in phase_scrapers if item.status == "rolled_back"),
            pending=sum(1 for item in phase_scrapers if item.status == "pending"),
        )

    return Summary(total=total, pending=pending, migrated=migrated, rolled_back=rolled_back, phase_progress=progress)


def summary_to_json(summary: Summary) -> dict[str, object]:
    return {
        "total": summary.total,
        "pending": summary.pending,
        "migrated": summary.migrated,
        "rolled_back": summary.rolled_back,
        "phase_progress": {
            f"phase_{phase}": {
                "total": info.total,
                "migrated": info.migrated,
                "rolled_back": info.rolled_back,
                "pending": info.pending,
            }
            for phase, info in summary.phase_progress.items()
        },
    }


def write_report(report_dir: Path, action: str, payload: dict[str, object]) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_path = report_dir / f"{stamp}-{action}.json"
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return report_path


def resolve_scraper_key(state: MigrationState, token: str) -> str | None:
    normalized = normalize(token)
    if normalized in state.scrapers:
        return normalized

    exact: list[str] = []
    partial: list[str] = []

    for key, scraper in state.scrapers.items():
        aliases: set[str] = {key, normalize(scraper.name), normalize(Path(scraper.config_path).stem)}
        if key.startswith("ai_"):
            aliases.add(key.removeprefix("ai_"))
        if normalized in aliases:
            exact.append(key)
            continue
        if any(normalized and normalized in alias for alias in aliases):
            partial.append(key)

    if len(exact) == 1:
        return exact[0]
    if len(partial) == 1:
        return partial[0]
    return None


def print_status(summary: Summary, state: MigrationState) -> None:
    print("crawl4ai migration status")
    print("=" * 28)
    print(f"Total scrapers tracked : {summary.total}")
    print(f"Pending               : {summary.pending}")
    print(f"Migrated              : {summary.migrated}")
    print(f"Rolled back           : {summary.rolled_back}")
    print("")

    for phase in (1, 2, 3, 4):
        info = summary.phase_progress[phase]
        print(f"Phase {phase}: {info.migrated}/{info.total} migrated, {info.rolled_back} rolled back, {info.pending} pending")

    print("")
    ordered = sorted(state.scrapers.items(), key=lambda item: (item[1].phase, item[0]))
    for key, scraper in ordered:
        config_flag = "config-ok" if scraper.config_present else "missing-config"
        print(f"- {key} | phase={scraper.phase} | risk={scraper.risk} | status={scraper.status} | {config_flag}")


def handle_status(options: CliOptions, command: StatusCommand) -> int:
    state = ensure_state(options.config_dir, options.state_file)
    summary = build_summary(state)

    payload = {
        "generated_at": now_iso(),
        "action": "status",
        "summary": summary_to_json(summary),
        "state_file": relative_path(options.state_file),
    }

    if command.output_json:
        print(json.dumps(payload, indent=2))
    else:
        print_status(summary, state)

    save_state(options.state_file, state)
    return 0


def handle_migrate_batch(options: CliOptions, command: MigrateBatchCommand) -> int:
    phase = command.phase
    if phase not in (1, 2, 3, 4):
        print("Batch must be between 1 and 4.", file=sys.stderr)
        return 1

    state = ensure_state(options.config_dir, options.state_file)
    keys = sorted(key for key, item in state.scrapers.items() if item.phase == phase)
    if not keys:
        print(f"No scrapers assigned to phase {phase}.", file=sys.stderr)
        return 1

    migrated: list[str] = []
    skipped: list[str] = []
    warnings: list[str] = []

    for key in keys:
        scraper = state.scrapers[key]
        if not scraper.config_present:
            skipped.append(key)
            warnings.append(f"{key}: config missing, skipped")
            add_event(scraper, "migrate_skipped", "Config missing during migrate-batch")
            continue

        if scraper.status == "migrated":
            skipped.append(key)
            add_event(scraper, "migrate_skipped", "Already migrated")
            continue

        scraper.status = "migrated"
        scraper.current_engine = "crawl4ai"
        scraper.migrated_at = now_iso()
        scraper.rolled_back_at = None
        add_event(scraper, "migrated", f"Migrated via batch phase {phase}")
        migrated.append(key)

    state.updated_at = now_iso()
    summary = build_summary(state)
    report_payload: dict[str, object] = {
        "generated_at": now_iso(),
        "action": "migrate-batch",
        "phase": phase,
        "migrated": migrated,
        "skipped": skipped,
        "warnings": warnings,
        "summary": summary_to_json(summary),
    }
    report_path = write_report(options.report_dir, f"migrate-batch-{phase}", report_payload)
    state.reports.append(relative_path(report_path))
    save_state(options.state_file, state)

    print(f"Phase {phase} migration complete.")
    print(f"Migrated: {len(migrated)} | Skipped: {len(skipped)}")
    print(f"Report: {report_path}")
    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"- {warning}")
    return 0


def handle_rollback(options: CliOptions, command: RollbackCommand) -> int:
    state = ensure_state(options.config_dir, options.state_file)
    key = resolve_scraper_key(state, command.scraper)
    if key is None:
        print(f"Unknown scraper: {command.scraper}", file=sys.stderr)
        return 1

    scraper = state.scrapers[key]
    previous_status = scraper.status
    scraper.status = "rolled_back"
    scraper.current_engine = "legacy"
    scraper.rolled_back_at = now_iso()
    add_event(scraper, "rolled_back", command.reason)

    state.updated_at = now_iso()
    summary = build_summary(state)
    report_payload: dict[str, object] = {
        "generated_at": now_iso(),
        "action": "rollback",
        "scraper": key,
        "previous_status": previous_status,
        "reason": command.reason,
        "summary": summary_to_json(summary),
    }
    report_path = write_report(options.report_dir, f"rollback-{key}", report_payload)
    state.reports.append(relative_path(report_path))
    save_state(options.state_file, state)

    print(f"Rolled back: {key}")
    print(f"Report: {report_path}")
    return 0


def handle_verify(options: CliOptions) -> int:
    state = ensure_state(options.config_dir, options.state_file)
    blockers: list[dict[str, object]] = []

    for key, scraper in sorted(state.scrapers.items()):
        if scraper.status != "migrated":
            blockers.append(
                {
                    "scraper": key,
                    "status": scraper.status,
                    "phase": scraper.phase,
                    "config_present": scraper.config_present,
                }
            )

    success = len(blockers) == 0
    summary = build_summary(state)
    report_payload: dict[str, object] = {
        "generated_at": now_iso(),
        "action": "verify",
        "success": success,
        "blockers": blockers,
        "summary": summary_to_json(summary),
    }
    report_path = write_report(options.report_dir, "verify", report_payload)
    state.reports.append(relative_path(report_path))
    save_state(options.state_file, state)

    if success:
        print("Verification PASSED: all tracked scrapers are migrated to crawl4ai.")
        print(f"Report: {report_path}")
        return 0

    print("Verification FAILED: some scrapers are not fully migrated.")
    print(f"Blockers: {len(blockers)}")
    for blocker in blockers:
        scraper_name = as_str(blocker.get("scraper")) or "unknown"
        status = as_str(blocker.get("status")) or "unknown"
        phase = as_int(blocker.get("phase"))
        phase_text = str(phase) if phase is not None else "?"
        present = as_bool(blocker.get("config_present"))
        present_text = "True" if present else "False"
        print(f"- {scraper_name} (phase {phase_text}): {status} | config_present={present_text}")
    print(f"Report: {report_path}")
    return 1


def print_usage() -> None:
    print("Usage:")
    print("  python scripts/migrate_all_scrapers.py status [--output-json]")
    print("  python scripts/migrate_all_scrapers.py migrate-batch <phase>")
    print("  python scripts/migrate_all_scrapers.py rollback <scraper> [--reason <text>]")
    print("  python scripts/migrate_all_scrapers.py verify")
    print("")
    print("Optional global flags (before command):")
    print("  --config-dir <path>")
    print("  --state-file <path>")
    print("  --report-dir <path>")


def parse_cli(argv: list[str]) -> CliRequest | None:
    if not argv:
        print_usage()
        return None

    if argv[0] in {"-h", "--help"}:
        print_usage()
        return None

    config_dir = DEFAULT_CONFIG_DIR
    state_file = DEFAULT_STATE_FILE
    report_dir = DEFAULT_REPORT_DIR

    index = 0
    while index < len(argv) and argv[index].startswith("--"):
        flag = argv[index]
        if flag == "--config-dir":
            if index + 1 >= len(argv):
                print("Missing value for --config-dir", file=sys.stderr)
                return None
            config_dir = Path(argv[index + 1])
            index += 2
            continue

        if flag == "--state-file":
            if index + 1 >= len(argv):
                print("Missing value for --state-file", file=sys.stderr)
                return None
            state_file = Path(argv[index + 1])
            index += 2
            continue

        if flag == "--report-dir":
            if index + 1 >= len(argv):
                print("Missing value for --report-dir", file=sys.stderr)
                return None
            report_dir = Path(argv[index + 1])
            index += 2
            continue

        print(f"Unknown global flag: {flag}", file=sys.stderr)
        return None

    if index >= len(argv):
        print_usage()
        return None

    command_name = argv[index]
    args = argv[index + 1 :]
    options = CliOptions(config_dir=config_dir, state_file=state_file, report_dir=report_dir)

    if command_name == "status":
        if not args:
            return CliRequest(options=options, command=StatusCommand(output_json=False))
        if len(args) == 1 and args[0] == "--output-json":
            return CliRequest(options=options, command=StatusCommand(output_json=True))
        print("Invalid arguments for status", file=sys.stderr)
        return None

    if command_name == "migrate-batch":
        if len(args) != 1:
            print("migrate-batch requires exactly one phase argument", file=sys.stderr)
            return None
        try:
            phase = int(args[0])
        except ValueError:
            print("Phase must be an integer", file=sys.stderr)
            return None
        return CliRequest(options=options, command=MigrateBatchCommand(phase=phase))

    if command_name == "rollback":
        if not args:
            print("rollback requires a scraper argument", file=sys.stderr)
            return None
        scraper = args[0]
        reason = "Manual rollback requested"
        tail = args[1:]
        position = 0
        while position < len(tail):
            token = tail[position]
            if token == "--reason":
                if position + 1 >= len(tail):
                    print("Missing value for --reason", file=sys.stderr)
                    return None
                reason = tail[position + 1]
                position += 2
                continue

            print(f"Unknown rollback option: {token}", file=sys.stderr)
            return None

        return CliRequest(options=options, command=RollbackCommand(scraper=scraper, reason=reason))

    if command_name == "verify":
        if args:
            print("verify takes no arguments", file=sys.stderr)
            return None
        return CliRequest(options=options, command=VerifyCommand())

    print(f"Unknown command: {command_name}", file=sys.stderr)
    return None


def run(request: CliRequest) -> int:
    if isinstance(request.command, StatusCommand):
        return handle_status(request.options, request.command)
    if isinstance(request.command, MigrateBatchCommand):
        return handle_migrate_batch(request.options, request.command)
    if isinstance(request.command, RollbackCommand):
        return handle_rollback(request.options, request.command)
    return handle_verify(request.options)


def main(argv: list[str]) -> int:
    request = parse_cli(argv)
    if request is None:
        return 1
    return run(request)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
