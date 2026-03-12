from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

from tests.evaluation.baseline_comparator import compare
from tests.evaluation.ground_truth_loader import get_all_skus
from tests.finetuning.hypothesis_tracker import (
    ExperimentConclusion,
    ExperimentMetrics,
    ExperimentResults,
    ExperimentStatus,
    HypothesisTracker,
)


@dataclass(frozen=True)
class ConfidenceInterval:
    lower: float
    upper: float


@dataclass(frozen=True)
class InterimResult:
    samples_seen: int
    baseline_successes: int
    challenger_successes: int
    p_value: float
    improvement: float


@dataclass(frozen=True)
class EarlyStoppingDecision:
    should_stop: bool
    reason: str | None = None
    winner: str | None = None


@dataclass(frozen=True)
class ABTestResult:
    baseline: str
    challenger: str
    baseline_rate: float
    challenger_rate: float
    improvement: float
    sample_size_requested: int
    sample_size_used: int
    required_sample_size: int
    confidence_level: float
    p_value: float
    is_significant: bool
    baseline_ci: ConfidenceInterval
    challenger_ci: ConfidenceInterval
    winner: str
    early_stopped: bool
    early_stop_reason: str | None
    recommendation: str


class ABTestRunner:
    hypothesis_tracker: HypothesisTracker | None
    min_detectable_effect: float
    power: float
    max_samples: int
    interim_step: int

    def __init__(
        self,
        hypothesis_tracker: HypothesisTracker | None = None,
        min_detectable_effect: float = 0.3,
        power: float = 0.8,
        max_samples: int = 1000,
        interim_step: int = 10,
    ) -> None:
        self.hypothesis_tracker = hypothesis_tracker
        self.min_detectable_effect = min_detectable_effect
        self.power = power
        self.max_samples = max_samples
        self.interim_step = interim_step

    def calculate_sample_size(
        self,
        min_detectable_effect: float,
        baseline_rate: float,
        confidence: float,
        power: float,
    ) -> int:
        if not (0.0 < min_detectable_effect < 1.0):
            raise ValueError("min_detectable_effect must be between 0 and 1")
        if not (0.0 < baseline_rate < 1.0):
            raise ValueError("baseline_rate must be between 0 and 1")
        if not (0.0 < confidence < 1.0):
            raise ValueError("confidence must be between 0 and 1")
        if not (0.0 < power < 1.0):
            raise ValueError("power must be between 0 and 1")

        alpha = 1.0 - confidence
        p1 = baseline_rate
        p2 = min(max(p1 + min_detectable_effect, 1e-6), 1 - 1e-6)
        p_bar = (p1 + p2) / 2.0

        z_alpha = _inverse_standard_normal(1.0 - (alpha / 2.0))
        z_beta = _inverse_standard_normal(power)

        numerator = (z_alpha * math.sqrt(2.0 * p_bar * (1.0 - p_bar)) + z_beta * math.sqrt((p1 * (1.0 - p1)) + (p2 * (1.0 - p2)))) ** 2
        denominator = (p2 - p1) ** 2
        return int(math.ceil(numerator / denominator))

    def early_stopping_check(self, interim_results: InterimResult) -> EarlyStoppingDecision:
        if interim_results.p_value < 0.01:
            winner = "challenger" if interim_results.improvement > 0 else "baseline"
            return EarlyStoppingDecision(
                should_stop=True,
                reason="clear_winner",
                winner=winner,
            )

        if interim_results.samples_seen >= self.max_samples and abs(interim_results.improvement) < 0.005:
            return EarlyStoppingDecision(
                should_stop=True,
                reason="no_convergence",
                winner="inconclusive",
            )

        return EarlyStoppingDecision(should_stop=False)

    def generate_recommendation(self, test_result: ABTestResult) -> str:
        if test_result.winner == "challenger" and test_result.is_significant:
            return "MERGE"
        if test_result.winner == "baseline" and test_result.is_significant:
            return "REJECT"
        return "REVIEW"

    def run_test(
        self,
        baseline: str,
        challenger: str,
        sample_size: int,
        confidence_level: float = 0.95,
    ) -> ABTestResult:
        if sample_size <= 0:
            raise ValueError("sample_size must be positive")
        if not (0.0 < confidence_level < 1.0):
            raise ValueError("confidence_level must be between 0 and 1")

        skus = get_all_skus()
        if not skus:
            raise ValueError("no ground-truth SKUs available for baseline calibration")

        baseline_snapshot = compare(
            baseline=baseline,
            challenger=challenger,
            skus=skus,
            confidence_level=confidence_level,
        )

        baseline_rate = _clamp_probability(baseline_snapshot.baseline_accuracy)
        challenger_rate = _clamp_probability(baseline_snapshot.challenger_accuracy)
        required_sample_size = self.calculate_sample_size(
            min_detectable_effect=self.min_detectable_effect,
            baseline_rate=baseline_rate,
            confidence=confidence_level,
            power=self.power,
        )
        if sample_size < required_sample_size:
            raise ValueError(f"sample_size={sample_size} is insufficient; required>={required_sample_size}")

        used_samples = min(sample_size, self.max_samples)
        baseline_successes = 0
        challenger_successes = 0
        stop_reason: str | None = None
        winner = "inconclusive"

        for idx in range(1, used_samples + 1):
            if _deterministic_success(baseline, idx, baseline_rate):
                baseline_successes += 1
            if _deterministic_success(challenger, idx, challenger_rate):
                challenger_successes += 1

            should_check = idx == used_samples or (idx % self.interim_step == 0)
            if not should_check:
                continue

            baseline_interim = baseline_successes / idx
            challenger_interim = challenger_successes / idx
            interim = InterimResult(
                samples_seen=idx,
                baseline_successes=baseline_successes,
                challenger_successes=challenger_successes,
                p_value=_two_proportion_p_value(
                    baseline_successes,
                    idx,
                    challenger_successes,
                    idx,
                ),
                improvement=challenger_interim - baseline_interim,
            )
            early_decision = self.early_stopping_check(interim)
            if early_decision.should_stop:
                used_samples = idx
                stop_reason = early_decision.reason
                winner = early_decision.winner or "inconclusive"
                break

        baseline_final = baseline_successes / used_samples
        challenger_final = challenger_successes / used_samples
        p_value = _two_proportion_p_value(
            baseline_successes,
            used_samples,
            challenger_successes,
            used_samples,
        )
        alpha = 1.0 - confidence_level
        is_significant = p_value < alpha

        if winner == "inconclusive":
            if is_significant:
                winner = "challenger" if challenger_final > baseline_final else "baseline"
            elif challenger_final == baseline_final:
                winner = "tie"

        result = ABTestResult(
            baseline=baseline,
            challenger=challenger,
            baseline_rate=baseline_final,
            challenger_rate=challenger_final,
            improvement=challenger_final - baseline_final,
            sample_size_requested=sample_size,
            sample_size_used=used_samples,
            required_sample_size=required_sample_size,
            confidence_level=confidence_level,
            p_value=p_value,
            is_significant=is_significant,
            baseline_ci=_wilson_interval(baseline_successes, used_samples, confidence_level),
            challenger_ci=_wilson_interval(challenger_successes, used_samples, confidence_level),
            winner=winner,
            early_stopped=stop_reason is not None,
            early_stop_reason=stop_reason,
            recommendation="REVIEW",
        )
        recommendation = self.generate_recommendation(result)
        result = ABTestResult(
            baseline=result.baseline,
            challenger=result.challenger,
            baseline_rate=result.baseline_rate,
            challenger_rate=result.challenger_rate,
            improvement=result.improvement,
            sample_size_requested=result.sample_size_requested,
            sample_size_used=result.sample_size_used,
            required_sample_size=result.required_sample_size,
            confidence_level=result.confidence_level,
            p_value=result.p_value,
            is_significant=result.is_significant,
            baseline_ci=result.baseline_ci,
            challenger_ci=result.challenger_ci,
            winner=result.winner,
            early_stopped=result.early_stopped,
            early_stop_reason=result.early_stop_reason,
            recommendation=recommendation,
        )

        self._record_hypothesis_results(result)
        return result

    def _record_hypothesis_results(self, result: ABTestResult) -> None:
        if self.hypothesis_tracker is None:
            return

        candidates = self.hypothesis_tracker.list_experiments(status=ExperimentStatus.RUNNING)
        if not candidates:
            candidates = self.hypothesis_tracker.list_experiments(status=ExperimentStatus.PENDING)

        match = next(
            (experiment for experiment in candidates if experiment.baseline_version == result.baseline and experiment.challenger_version == result.challenger),
            None,
        )
        if match is None:
            return

        payload = ExperimentResults(
            baseline_metrics=ExperimentMetrics(
                accuracy=result.baseline_rate,
                total_samples=result.sample_size_used,
                error_count=result.sample_size_used - int(round(result.baseline_rate * result.sample_size_used)),
            ),
            challenger_metrics=ExperimentMetrics(
                accuracy=result.challenger_rate,
                total_samples=result.sample_size_used,
                error_count=result.sample_size_used - int(round(result.challenger_rate * result.sample_size_used)),
            ),
            notes=(f"AB test completed: p={result.p_value:.6f}, winner={result.winner}, recommendation={result.recommendation}"),
        )
        payload.calculate_improvements()
        _ = self.hypothesis_tracker.record_results(match.id, payload)

        if result.recommendation == "MERGE":
            conclusion = ExperimentConclusion.ACCEPTED
        elif result.recommendation == "REJECT":
            conclusion = ExperimentConclusion.REJECTED
        else:
            conclusion = ExperimentConclusion.INCONCLUSIVE
        _ = self.hypothesis_tracker.complete_experiment(match.id, conclusion)


def _clamp_probability(value: float) -> float:
    return min(max(value, 1e-6), 1.0 - 1e-6)


def _deterministic_success(version: str, sample_index: int, probability: float) -> bool:
    digest = hashlib.sha256(f"{version}:{sample_index}".encode("utf-8")).digest()
    roll = int.from_bytes(digest[:8], "big") / float(2**64)
    return roll < probability


def _two_proportion_p_value(success_a: int, n_a: int, success_b: int, n_b: int) -> float:
    if n_a <= 0 or n_b <= 0:
        return 1.0

    rate_a = success_a / n_a
    rate_b = success_b / n_b
    pooled = (success_a + success_b) / (n_a + n_b)
    variance = pooled * (1.0 - pooled) * ((1.0 / n_a) + (1.0 / n_b))
    if variance <= 0:
        return 1.0

    z = (rate_b - rate_a) / math.sqrt(variance)
    return math.erfc(abs(z) / math.sqrt(2.0))


def _wilson_interval(successes: int, n: int, confidence_level: float) -> ConfidenceInterval:
    if n <= 0:
        return ConfidenceInterval(0.0, 0.0)

    z = _inverse_standard_normal(1.0 - ((1.0 - confidence_level) / 2.0))
    phat = successes / n
    z2 = z * z
    denominator = 1.0 + (z2 / n)
    center = (phat + (z2 / (2.0 * n))) / denominator
    margin = (z / denominator) * math.sqrt((phat * (1.0 - phat) / n) + (z2 / (4.0 * n * n)))
    return ConfidenceInterval(max(0.0, center - margin), min(1.0, center + margin))


def _inverse_standard_normal(probability: float) -> float:
    if not (0.0 < probability < 1.0):
        raise ValueError("probability must be between 0 and 1")

    a1 = -39.6968302866538
    a2 = 220.946098424521
    a3 = -275.928510446969
    a4 = 138.357751867269
    a5 = -30.6647980661472
    a6 = 2.50662827745924
    b1 = -54.4760987982241
    b2 = 161.585836858041
    b3 = -155.698979859887
    b4 = 66.8013118877197
    b5 = -13.2806815528857
    c1 = -0.00778489400243029
    c2 = -0.322396458041136
    c3 = -2.40075827716184
    c4 = -2.54973253934373
    c5 = 4.37466414146497
    c6 = 2.93816398269878
    d1 = 0.00778469570904146
    d2 = 0.32246712907004
    d3 = 2.445134137143
    d4 = 3.75440866190742

    p_low = 0.02425
    p_high = 1.0 - p_low

    if probability < p_low:
        q = math.sqrt(-2.0 * math.log(probability))
        return ((((((c1 * q) + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q) + d2) * q + d3) * q + d4)
    if probability > p_high:
        q = math.sqrt(-2.0 * math.log(1.0 - probability))
        return -((((((c1 * q) + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q) + d2) * q + d3) * q + d4)

    q = probability - 0.5
    r = q * q
    return (((((((a1 * r) + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) / ((((((b1 * r) + b2) * r + b3) * r + b4) * r + b5) * r + 1.0)
