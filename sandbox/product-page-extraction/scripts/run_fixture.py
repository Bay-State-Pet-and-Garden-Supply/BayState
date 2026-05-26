#!/usr/bin/env python3
"""Run or validate JSONL product fixtures. Round 2: field scores, per-fixture aggregation."""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any

from common import get_output_dir, now_slug, read_json, sandbox_path, write_json
from run_packet import run_product

REQUIRED = ["fixture_id", "site_key", "mode", "brand", "name", "expected", "thresholds", "options"]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_no, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip() or line.strip().startswith("#"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{line_no}: invalid JSON: {exc}") from exc
        missing = [key for key in REQUIRED if key not in row]
        if missing:
            raise SystemExit(f"{path}:{line_no}: missing required fields {missing}")
        if row["mode"] == "known_url" and not row.get("url"):
            raise SystemExit(f"{path}:{line_no}: known_url fixture requires url")
        rows.append(row)
    return rows


def run_agent_browser(url: str, fixture_id: str) -> Path:
    proc = subprocess.run(
        ["bash", str(sandbox_path("scripts/agent_browser_capture.sh")), url, fixture_id, str(sandbox_path("agent-browser-runs"))],
        text=True,
        capture_output=True,
        timeout=120,
        check=True,
    )
    data = json.loads(proc.stdout[proc.stdout.find("{") :])
    return sandbox_path(data["result"])


def compare(packet: Path, browser_result: Path, out: Path) -> None:
    subprocess.run(
        ["python3", str(sandbox_path("scripts/compare_results.py")), "--packet", str(packet), "--agent-browser", str(browser_result), "--out", str(out)],
        text=True,
        capture_output=True,
        timeout=30,
        check=True,
    )


async def main_async() -> None:
    parser = argparse.ArgumentParser(description="Validate or run product fixtures. Round 2.")
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--site-config", type=Path, default=Path("configs/site.sample.yaml"))
    parser.add_argument("--extraction-config", type=Path, default=Path("configs/extraction.sample.yaml"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--fixture-id")
    parser.add_argument("--no-llm", action="store_true")
    parser.add_argument("--agent-browser-fallback", action="store_true")
    parser.add_argument("--output-dir", default=str(get_output_dir()))
    args = parser.parse_args()

    rows = load_jsonl(sandbox_path(args.fixture))
    if args.fixture_id:
        rows = [row for row in rows if row["fixture_id"] == args.fixture_id]
    if args.limit:
        rows = rows[: args.limit]
    if args.dry_run:
        print(json.dumps({"fixture": str(args.fixture), "valid_rows": len(rows), "fixture_ids": [r["fixture_id"] for r in rows]}, indent=2))
        return

    batch_dir = sandbox_path(args.output_dir) / f"{now_slug()}-fixture-batch"
    batch_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, Any] = {"batch_dir": str(batch_dir), "results": []}
    for row in rows:
        options = row.get("options", {})
        llm_mode = "off" if args.no_llm else ("auto" if options.get("allow_llm") == "auto" else "off")
        packet_args = argparse.Namespace(
            site_config=args.site_config,
            extraction_config=args.extraction_config,
            site_key=row["site_key"],
            url=row.get("url") if row.get("mode") == "known_url" else None,
            upc=row.get("upc"),
            sku=row.get("sku"),
            brand=row["brand"],
            name=row["name"],
            fixture_id=row["fixture_id"],
            output_dir=str(batch_dir),
            llm=llm_mode,
            top=5,
            timeout_ms=45000,
            screenshot=bool(options.get("screenshot")),
            dry_run=False,
            fixture_row=row,
        )
        try:
            packet_path = await run_product(packet_args)
            assert packet_path is not None
            packet = read_json(packet_path)
            extraction = packet.get("extraction", {})
            validation = packet.get("validation", {})
            classification = packet.get("classification", {})
            media = extraction.get("media", {})
            llm_metrics = extraction.get("llm_metrics")

            result: dict[str, Any] = {
                "fixture_id": row["fixture_id"],
                "status": "ok",
                "packet": str(packet_path),
                "recommendation": validation.get("recommendation"),
                "confidence": extraction.get("confidence"),
                "page_type": classification.get("page_type"),
                "image_count_by_method": media.get("image_count_by_method"),
                "field_scores": validation.get("field_scores"),
                "llm_metrics": llm_metrics,
            }
            if args.agent_browser_fallback or options.get("allow_agent_browser") is True:
                browser_result = run_agent_browser(packet["crawl"]["final_url"], row["fixture_id"])
                comparison_path = packet_path.parent / "comparison.json"
                compare(packet_path, browser_result, comparison_path)
                packet["artifacts"]["agent_browser"] = str(browser_result)
                packet["artifacts"]["comparison"] = str(comparison_path)
                write_json(packet_path, packet)
                result["agent_browser"] = str(browser_result)
                result["comparison"] = str(comparison_path)
                # Also load and merge comparison image data
                comparison = read_json(comparison_path)
                result["image_comparison"] = comparison.get("image_comparison")
            summary["results"].append(result)
        except Exception as exc:  # noqa: BLE001
            summary["results"].append({"fixture_id": row["fixture_id"], "status": "error", "error": repr(exc)})

    # Aggregate
    if summary["results"]:
        groups: dict[str, dict[str, Any]] = {}
        ok_results = [r for r in summary["results"] if r["status"] == "ok"]
        rendered_counts: list[float] = []
        agent_counts: list[float] = []
        close_enough_count = 0
        agent_uniques: list[float] = []
        default_to_rendered_gains: list[float] = []
        field_pass_rates: dict[str, list[bool]] = {}
        llm_schema_failures = 0
        hallucination_flags = 0

        for r in summary["results"]:
            group = "error" if r["status"] == "error" else (r.get("page_type") or "unknown")
            if group not in groups:
                groups[group] = {"count": 0, "accept": 0, "review": 0, "conflict": 0, "llm_timeouts": 0}
            g = groups[group]
            g["count"] += 1
            rec = r.get("recommendation") or "unknown"
            if rec in ("accept", "review", "conflict"):
                g[rec] += 1
            mm = r.get("llm_metrics") or {}
            if mm.get("timeout_count", 0) > 0 or (mm.get("error") and "timeout" in str(mm.get("error")).lower()):
                g["llm_timeouts"] += 1

            # Image metrics from fixtures that have agent-browser comparison
            img_comp = r.get("image_comparison") or {}
            if img_comp.get("crawl4ai_rendered_count") is not None:
                rendered_counts.append(float(img_comp["crawl4ai_rendered_count"]))
                agent_counts.append(float(img_comp["agent_browser_count"]))
                if img_comp.get("crawl4ai_rendered_close_enough"):
                    close_enough_count += 1
                agent_uniques.append(float(img_comp.get("agent_browser_unique_count", 0)))
            img_method = r.get("image_count_by_method") or {}
            default_cnt = float(img_method.get("default", 0))
            rendered_cnt = float(img_method.get("rendered", 0))
            if rendered_cnt >= default_cnt:
                default_to_rendered_gains.append(rendered_cnt - default_cnt)

            # Field pass rates
            fs = r.get("field_scores") or {}
            for fname, fscore in fs.items():
                if fname not in field_pass_rates:
                    field_pass_rates[fname] = []
                field_pass_rates[fname].append(bool(fscore.get("passed", False)))

            # LLM metrics
            if mm.get("schema_validation_passed") is False:
                llm_schema_failures += 1

        aggregate: dict[str, Any] = {
            "by_page_type": groups,
            "total_fixtures": len(summary["results"]),
            "total_ok": len(ok_results),
            "totals": {
                field: sum(g.get(field, 0) for g in groups.values())
                for field in ("accept", "review", "conflict", "llm_timeouts")
            },
        }

        # Image benchmark metrics
        if rendered_counts:
            import statistics
            aggregate["image_benchmark"] = {
                "fixtures_with_agent_browser": len(rendered_counts),
                "rendered_mean": round(statistics.mean(rendered_counts), 1),
                "rendered_median": round(statistics.median(rendered_counts), 1) if len(rendered_counts) > 1 else rendered_counts[0],
                "agent_browser_mean": round(statistics.mean(agent_counts), 1),
                "agent_browser_median": round(statistics.median(agent_counts), 1) if len(agent_counts) > 1 else agent_counts[0],
                "close_enough_pass_count": close_enough_count,
                "close_enough_pass_rate": round(close_enough_count / max(len(rendered_counts), 1), 3),
                "agent_browser_unique_mean": round(statistics.mean(agent_uniques), 1) if agent_uniques else 0,
                "default_to_rendered_gain_mean": round(statistics.mean(default_to_rendered_gains), 1) if default_to_rendered_gains else 0,
            }

        # Field pass rates
        aggregate["field_pass_rates"] = {
            fname: round(sum(result_list) / max(len(result_list), 1), 3)
            for fname, result_list in sorted(field_pass_rates.items())
        }

        aggregate["llm_stats"] = {
            "schema_failures": llm_schema_failures,
        }

        summary["aggregate"] = aggregate
        summary["total_fixtures"] = len(summary["results"])
        summary["total_ok"] = len(ok_results)

    write_json(batch_dir / "summary.json", summary)
    print(json.dumps({"summary": str(batch_dir / "summary.json")}, indent=2))


if __name__ == "__main__":
    asyncio.run(main_async())
