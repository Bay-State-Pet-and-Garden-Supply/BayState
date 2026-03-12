"""Telemetry tracking for retailer effectiveness."""

import logging
import time
from dataclasses import dataclass
from threading import Lock
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class RetailerStats:
    """Statistics for a single retailer."""

    domain: str
    attempts: int = 0
    successes: int = 0
    last_attempt_time: Optional[float] = None
    last_success_time: Optional[float] = None

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts


class RetailerTelemetry:
    """Tracks retailer effectiveness for search prioritization.

    In-memory, thread-safe tracking. Lightweight writes (non-blocking).
    Logs top performers periodically.
    """

    def __init__(self, log_interval: int = 10):
        # domain -> RetailerStats
        self._stats: Dict[str, RetailerStats] = {}
        self._lock = Lock()
        self._total_attempts = 0
        self._log_interval = max(1, int(log_interval))

    def record_attempt(self, domain: str, success: bool) -> None:
        """Record an extraction attempt for a retailer.

        Must be fast (<10ms). Uses a small lock for safety.
        """
        if not domain:
            return
        now = time.time()
        # Keep critical section minimal
        with self._lock:
            stats = self._stats.get(domain)
            if stats is None:
                stats = RetailerStats(domain=domain)
                self._stats[domain] = stats

            stats.attempts += 1
            stats.last_attempt_time = now
            if success:
                stats.successes += 1
                stats.last_success_time = now

            self._total_attempts += 1
            total = self._total_attempts

        # Log outside heavy state updates but check interval
        if total % self._log_interval == 0:
            try:
                self._log_stats()
            except Exception:
                logger.exception("Failed to log retailer telemetry")

    def get_prioritized_retailers(self, retailers: List[str], limit: int) -> List[str]:
        """Return retailers sorted by historical success rate.

        Retailers not seen before are treated with success_rate=0 and placed after
        known retailers. If two retailers have equal rate, higher attempts wins.
        """
        with self._lock:
            # build list of tuples (domain, rate, attempts)
            enriched = []
            for r in retailers:
                s = self._stats.get(r)
                if s is None:
                    enriched.append((r, 0.0, 0))
                else:
                    enriched.append((r, s.success_rate, s.attempts))

        # sort by rate desc, then attempts desc, then domain
        enriched.sort(key=lambda x: (-x[1], -x[2], x[0]))
        prioritized = [d for d, _, _ in enriched][: max(0, int(limit))]
        return prioritized

    def _log_stats(self) -> None:
        """Log current top-performing retailers."""
        # snapshot under lock
        with self._lock:
            items = list(self._stats.values())

        if not items:
            logger.debug("RetailerTelemetry: no stats to log")
            return

        # top 5 by success rate, tiebreaker attempts
        items.sort(key=lambda s: (-s.success_rate, -s.attempts, s.domain))
        top = items[:5]
        lines = [f"{i + 1}. {s.domain} rate={s.success_rate:.2f} ({s.successes}/{s.attempts})" for i, s in enumerate(top)]
        logger.info("Top retailers by success rate:\n" + "\n".join(lines))
