from __future__ import annotations

from dataclasses import dataclass
from statistics import mean


@dataclass(frozen=True)
class DiscoveryResultRow:
    upc: str
    brand: str | None
    product_name: str
    expected_official_domains: list[str]
    expected_url: str | None
    discovered_url: str | None
    discovered_domain: str | None
    domain_match: bool
    exact_url_match: bool
    duration_ms: float
    cost_usd: float
    error: str | None
    category: str | None = None
    difficulty: str | None = None
    predicted_name: str | None = None
    phase1_result_count: int = 0
    phase2_result_count: int = 0


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int((len(ordered) - 1) * ratio)
    return float(ordered[index])


def summarize(rows: list[DiscoveryResultRow]) -> dict[str, object]:
    total = len(rows)
    durations = [row.duration_ms for row in rows]
    domain_match_count = sum(1 for row in rows if row.domain_match)
    exact_url_match_count = sum(1 for row in rows if row.exact_url_match)
    failed = [row for row in rows if row.error]
    failure_reasons: dict[str, int] = {}
    for row in failed:
        reason = row.error or "unknown"
        failure_reasons[reason] = failure_reasons.get(reason, 0) + 1

    return {
        "total_entries": total,
        "successful_discoveries": total - len(failed),
        "failed_count": len(failed),
        "domain_match_count": domain_match_count,
        "exact_url_match_count": exact_url_match_count,
        "domain_match_rate": (domain_match_count / total) if total else 0.0,
        "exact_url_match_rate": (exact_url_match_count / total) if total else 0.0,
        "average_duration_ms": mean(durations) if durations else 0.0,
        "p50_duration_ms": _percentile(durations, 0.50),
        "p95_duration_ms": _percentile(durations, 0.95),
        "total_cost_usd": round(sum(row.cost_usd for row in rows), 6),
        "average_cost_usd": (sum(row.cost_usd for row in rows) / total) if total else 0.0,
        "failure_reasons": failure_reasons,
    }
