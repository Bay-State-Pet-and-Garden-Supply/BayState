"""
Hypothesis Tracker for Prompt Experiments

Tracks hypothesis-driven prompt experiments with full audit trail.
Links experiments to git commits and maintains EXPERIMENTS.md log.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any


class ExperimentStatus(str, Enum):
    """Status of an experiment."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"


class ExperimentConclusion(str, Enum):
    """Conclusion of a completed experiment."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"
    INCONCLUSIVE = "inconclusive"


@dataclass
class ExperimentMetrics:
    """Metrics for before/after comparison."""

    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    error_count: int = 0
    total_samples: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ExperimentMetrics:
        return cls(**data)


@dataclass
class ExperimentResults:
    """Results from running an experiment."""

    baseline_metrics: ExperimentMetrics = field(default_factory=ExperimentMetrics)
    challenger_metrics: ExperimentMetrics = field(default_factory=ExperimentMetrics)
    improvement_pct: dict[str, float] = field(default_factory=dict)
    test_duration_seconds: float = 0.0
    notes: str = ""

    def calculate_improvements(self) -> None:
        """Calculate percentage improvements across all metrics."""
        self.improvement_pct = {}
        baseline = self.baseline_metrics
        challenger = self.challenger_metrics

        if baseline.accuracy > 0:
            self.improvement_pct["accuracy"] = (challenger.accuracy - baseline.accuracy) / baseline.accuracy * 100

        if baseline.precision > 0:
            self.improvement_pct["precision"] = (challenger.precision - baseline.precision) / baseline.precision * 100

        if baseline.recall > 0:
            self.improvement_pct["recall"] = (challenger.recall - baseline.recall) / baseline.recall * 100

        if baseline.f1_score > 0:
            self.improvement_pct["f1_score"] = (challenger.f1_score - baseline.f1_score) / baseline.f1_score * 100

    def to_dict(self) -> dict[str, Any]:
        return {
            "baseline_metrics": self.baseline_metrics.to_dict(),
            "challenger_metrics": self.challenger_metrics.to_dict(),
            "improvement_pct": self.improvement_pct,
            "test_duration_seconds": self.test_duration_seconds,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ExperimentResults:
        return cls(
            baseline_metrics=ExperimentMetrics.from_dict(data.get("baseline_metrics", {})),
            challenger_metrics=ExperimentMetrics.from_dict(data.get("challenger_metrics", {})),
            improvement_pct=data.get("improvement_pct", {}),
            test_duration_seconds=data.get("test_duration_seconds", 0.0),
            notes=data.get("notes", ""),
        )


@dataclass
class PromptExperiment:
    """A single prompt experiment with hypothesis and results."""

    # Identification
    id: str
    hypothesis: str

    # Changes being tested
    prompt_changes: str
    test_skus: list[str] = field(default_factory=list)

    # Version tracking
    baseline_version: str = ""
    challenger_version: str = ""

    # Results and conclusion
    results: ExperimentResults | None = None
    conclusion: ExperimentConclusion | None = None

    # Git tracking
    git_commit: str = ""

    # Timestamps
    created_at: str = ""
    completed_at: str = ""

    # Status
    status: ExperimentStatus = ExperimentStatus.PENDING

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "hypothesis": self.hypothesis,
            "prompt_changes": self.prompt_changes,
            "test_skus": self.test_skus,
            "baseline_version": self.baseline_version,
            "challenger_version": self.challenger_version,
            "results": self.results.to_dict() if self.results else None,
            "conclusion": self.conclusion.value if self.conclusion else None,
            "git_commit": self.git_commit,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "status": self.status.value,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PromptExperiment:
        return cls(
            id=data["id"],
            hypothesis=data["hypothesis"],
            prompt_changes=data["prompt_changes"],
            test_skus=data.get("test_skus", []),
            baseline_version=data.get("baseline_version", ""),
            challenger_version=data.get("challenger_version", ""),
            results=ExperimentResults.from_dict(data["results"]) if data.get("results") else None,
            conclusion=ExperimentConclusion(data["conclusion"]) if data.get("conclusion") else None,
            git_commit=data.get("git_commit", ""),
            created_at=data.get("created_at", ""),
            completed_at=data.get("completed_at", ""),
            status=ExperimentStatus(data.get("status", "pending")),
        )


class HypothesisTracker:
    """Track and manage prompt experiments with full audit trail."""

    def __init__(
        self,
        storage_dir: str | Path | None = None,
        experiments_file: str | Path | None = None,
        log_file: str | Path | None = None,
    ):
        """
        Initialize the hypothesis tracker.

        Args:
            storage_dir: Directory to store experiment data (default: tests/finetuning/)
            experiments_file: Path to experiments JSON file
            log_file: Path to EXPERIMENTS.md log file
        """
        self.storage_dir = Path(storage_dir or Path(__file__).parent)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.experiments_file = Path(experiments_file or self.storage_dir / "experiments.json")

        # EXPERIMENTS.md lives in prompts directory
        self.log_file = Path(log_file or self.storage_dir.parent.parent / "prompts" / "EXPERIMENTS.md")

        self._experiments: dict[str, PromptExperiment] = {}
        self._load_experiments()

    def _load_experiments(self) -> None:
        """Load experiments from storage file."""
        if self.experiments_file.exists():
            try:
                with open(self.experiments_file, "r") as f:
                    data = json.load(f)
                    for exp_id, exp_data in data.items():
                        self._experiments[exp_id] = PromptExperiment.from_dict(exp_data)
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Warning: Could not load experiments: {e}")
                self._experiments = {}

    def _save_experiments(self) -> None:
        """Save experiments to storage file."""
        data = {exp_id: exp.to_dict() for exp_id, exp in self._experiments.items()}
        with open(self.experiments_file, "w") as f:
            json.dump(data, f, indent=2)

    def _get_git_commit(self) -> str:
        """Get current git commit hash."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            return "unknown"

    def _generate_experiment_id(self, hypothesis: str) -> str:
        """Generate unique experiment ID from hypothesis."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Create short hash from hypothesis for uniqueness
        hypothesis_hash = hashlib.md5(hypothesis.encode()).hexdigest()[:8]
        return f"exp_{timestamp}_{hypothesis_hash}"

    def _normalize_hypothesis(self, hypothesis: str) -> str:
        """Normalize hypothesis for duplicate detection."""
        # Lowercase, remove extra whitespace, remove punctuation
        normalized = hypothesis.lower().strip()
        normalized = re.sub(r"\s+", " ", normalized)
        normalized = re.sub(r"[^\w\s]", "", normalized)
        return normalized

    def _is_duplicate_hypothesis(self, hypothesis: str) -> bool:
        """Check if a similar hypothesis already exists."""
        normalized_new = self._normalize_hypothesis(hypothesis)

        for exp in self._experiments.values():
            normalized_existing = self._normalize_hypothesis(exp.hypothesis)

            # Check for exact match
            if normalized_new == normalized_existing:
                return True

            # Check for high similarity (simple word overlap)
            new_words = set(normalized_new.split())
            existing_words = set(normalized_existing.split())

            if len(new_words) > 0 and len(existing_words) > 0:
                overlap = len(new_words & existing_words) / len(new_words)
                if overlap > 0.8:  # 80% word overlap
                    return True

        return False

    def create_experiment(
        self,
        hypothesis: str,
        prompt_changes: str,
        test_skus: list[str],
        baseline_version: str = "",
        challenger_version: str = "",
        allow_duplicates: bool = False,
    ) -> PromptExperiment:
        """
        Create a new prompt experiment.

        Args:
            hypothesis: The hypothesis being tested
            prompt_changes: Description of prompt changes
            test_skus: List of SKUs to test against
            baseline_version: Version of baseline prompt
            challenger_version: Version of challenger prompt
            allow_duplicates: Whether to allow duplicate hypotheses

        Returns:
            The created PromptExperiment

        Raises:
            ValueError: If duplicate hypothesis detected and allow_duplicates=False
        """
        if not allow_duplicates and self._is_duplicate_hypothesis(hypothesis):
            raise ValueError(f"Similar hypothesis already exists. Use allow_duplicates=True to create anyway.")

        experiment_id = self._generate_experiment_id(hypothesis)
        git_commit = self._get_git_commit()

        experiment = PromptExperiment(
            id=experiment_id,
            hypothesis=hypothesis,
            prompt_changes=prompt_changes,
            test_skus=test_skus,
            baseline_version=baseline_version,
            challenger_version=challenger_version,
            git_commit=git_commit,
            status=ExperimentStatus.PENDING,
        )

        self._experiments[experiment_id] = experiment
        self._save_experiments()

        return experiment

    def start_experiment(self, experiment_id: str) -> PromptExperiment:
        """
        Mark an experiment as running.

        Args:
            experiment_id: The experiment ID

        Returns:
            The updated PromptExperiment

        Raises:
            KeyError: If experiment not found
        """
        if experiment_id not in self._experiments:
            raise KeyError(f"Experiment {experiment_id} not found")

        experiment = self._experiments[experiment_id]
        experiment.status = ExperimentStatus.RUNNING
        self._save_experiments()

        return experiment

    def record_results(
        self,
        experiment_id: str,
        results: ExperimentResults,
    ) -> PromptExperiment:
        """
        Record results for an experiment.

        Args:
            experiment_id: The experiment ID
            results: The experiment results

        Returns:
            The updated PromptExperiment

        Raises:
            KeyError: If experiment not found
        """
        if experiment_id not in self._experiments:
            raise KeyError(f"Experiment {experiment_id} not found")

        # Calculate improvements
        results.calculate_improvements()

        experiment = self._experiments[experiment_id]
        experiment.results = results
        self._save_experiments()

        return experiment

    def complete_experiment(
        self,
        experiment_id: str,
        conclusion: ExperimentConclusion,
    ) -> PromptExperiment:
        """
        Mark an experiment as complete with a conclusion.

        Args:
            experiment_id: The experiment ID
            conclusion: The experiment conclusion

        Returns:
            The updated PromptExperiment

        Raises:
            KeyError: If experiment not found
        """
        if experiment_id not in self._experiments:
            raise KeyError(f"Experiment {experiment_id} not found")

        experiment = self._experiments[experiment_id]
        experiment.conclusion = conclusion
        experiment.status = ExperimentStatus.COMPLETED
        experiment.completed_at = datetime.now().isoformat()

        self._save_experiments()
        self._update_experiments_log()

        return experiment

    def get_experiment(self, experiment_id: str) -> PromptExperiment:
        """
        Get a specific experiment by ID.

        Args:
            experiment_id: The experiment ID

        Returns:
            The PromptExperiment

        Raises:
            KeyError: If experiment not found
        """
        if experiment_id not in self._experiments:
            raise KeyError(f"Experiment {experiment_id} not found")

        return self._experiments[experiment_id]

    def list_experiments(
        self,
        status: ExperimentStatus | None = None,
        conclusion: ExperimentConclusion | None = None,
    ) -> list[PromptExperiment]:
        """
        List all experiments, optionally filtered.

        Args:
            status: Filter by status
            conclusion: Filter by conclusion

        Returns:
            List of PromptExperiment objects
        """
        experiments = list(self._experiments.values())

        if status:
            experiments = [e for e in experiments if e.status == status]

        if conclusion:
            experiments = [e for e in experiments if e.conclusion == conclusion]

        # Sort by created_at descending
        experiments.sort(key=lambda e: e.created_at, reverse=True)

        return experiments

    def _update_experiments_log(self) -> None:
        """Update EXPERIMENTS.md log file with all completed experiments."""
        # Get completed experiments
        completed = [e for e in self._experiments.values() if e.status == ExperimentStatus.COMPLETED]
        completed.sort(key=lambda e: e.completed_at or "", reverse=True)

        # Build markdown content
        lines = [
            "# Prompt Experiment Log",
            "",
            "This file tracks all hypothesis-driven prompt experiments.",
            "Each experiment includes hypothesis, changes, results, and conclusion.",
            "",
            "## Summary",
            "",
        ]

        # Add summary statistics
        accepted = len([e for e in completed if e.conclusion == ExperimentConclusion.ACCEPTED])
        rejected = len([e for e in completed if e.conclusion == ExperimentConclusion.REJECTED])
        inconclusive = len([e for e in completed if e.conclusion == ExperimentConclusion.INCONCLUSIVE])

        lines.extend(
            [
                f"- **Total Experiments:** {len(completed)}",
                f"- **Accepted:** {accepted}",
                f"- **Rejected:** {rejected}",
                f"- **Inconclusive:** {inconclusive}",
                "",
                "---",
                "",
            ]
        )

        # Add each experiment
        for exp in completed:
            lines.extend(
                [
                    f"## {exp.id}",
                    "",
                    f"**Status:** {exp.conclusion.value.upper() if exp.conclusion else 'UNKNOWN'}",
                    f"**Created:** {exp.created_at}",
                    f"**Completed:** {exp.completed_at}",
                    "",
                    "### Hypothesis",
                    "",
                    exp.hypothesis,
                    "",
                    "### Prompt Changes",
                    "",
                    exp.prompt_changes,
                    "",
                ]
            )

            if exp.test_skus:
                lines.extend(
                    [
                        "### Test SKUs",
                        "",
                        ", ".join(exp.test_skus[:10])  # Show first 10
                        + (f" (+{len(exp.test_skus) - 10} more)" if len(exp.test_skus) > 10 else ""),
                        "",
                    ]
                )

            if exp.baseline_version or exp.challenger_version:
                lines.extend(
                    [
                        "### Versions",
                        "",
                        f"- **Baseline:** {exp.baseline_version or 'N/A'}",
                        f"- **Challenger:** {exp.challenger_version or 'N/A'}",
                        "",
                    ]
                )

            if exp.git_commit:
                lines.extend(
                    [
                        "### Git Commit",
                        "",
                        f"`{exp.git_commit}`",
                        "",
                    ]
                )

            if exp.results:
                lines.extend(
                    [
                        "### Results",
                        "",
                        "#### Baseline Metrics",
                        "",
                        f"- Accuracy: {exp.results.baseline_metrics.accuracy:.2%}",
                        f"- Precision: {exp.results.baseline_metrics.precision:.2%}",
                        f"- Recall: {exp.results.baseline_metrics.recall:.2%}",
                        f"- F1 Score: {exp.results.baseline_metrics.f1_score:.2%}",
                        "",
                        "#### Challenger Metrics",
                        "",
                        f"- Accuracy: {exp.results.challenger_metrics.accuracy:.2%}",
                        f"- Precision: {exp.results.challenger_metrics.precision:.2%}",
                        f"- Recall: {exp.results.challenger_metrics.recall:.2%}",
                        f"- F1 Score: {exp.results.challenger_metrics.f1_score:.2%}",
                        "",
                    ]
                )

                if exp.results.improvement_pct:
                    lines.extend(
                        [
                            "#### Improvements",
                            "",
                        ]
                    )
                    for metric, pct in exp.results.improvement_pct.items():
                        emoji = "+" if pct > 0 else ""
                        lines.append(f"- {metric}: {emoji}{pct:.1f}%")
                    lines.append("")

                if exp.results.notes:
                    lines.extend(
                        [
                            "#### Notes",
                            "",
                            exp.results.notes,
                            "",
                        ]
                    )

            lines.extend(
                [
                    "---",
                    "",
                ]
            )

        # Write log file
        with open(self.log_file, "w") as f:
            f.write("\n".join(lines))

    def delete_experiment(self, experiment_id: str) -> bool:
        """
        Delete an experiment (use with caution).

        Args:
            experiment_id: The experiment ID to delete

        Returns:
            True if deleted, False if not found
        """
        if experiment_id in self._experiments:
            del self._experiments[experiment_id]
            self._save_experiments()
            self._update_experiments_log()
            return True
        return False


# CLI interface for creating experiments
def main():
    """CLI for hypothesis tracker."""
    import argparse

    parser = argparse.ArgumentParser(description="Hypothesis Tracker CLI for prompt experiments")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new experiment")
    create_parser.add_argument(
        "hypothesis",
        help="The hypothesis being tested",
    )
    create_parser.add_argument(
        "--changes",
        "-c",
        required=True,
        help="Description of prompt changes",
    )
    create_parser.add_argument(
        "--skus",
        "-s",
        required=True,
        help="Comma-separated list of test SKUs",
    )
    create_parser.add_argument(
        "--baseline",
        "-b",
        default="",
        help="Baseline prompt version",
    )
    create_parser.add_argument(
        "--challenger",
        "-ch",
        default="",
        help="Challenger prompt version",
    )
    create_parser.add_argument(
        "--allow-duplicates",
        action="store_true",
        help="Allow duplicate hypotheses",
    )

    # List command
    subparsers.add_parser("list", help="List all experiments")

    # Get command
    get_parser = subparsers.add_parser("get", help="Get experiment details")
    get_parser.add_argument("experiment_id", help="The experiment ID")

    # Complete command
    complete_parser = subparsers.add_parser("complete", help="Complete an experiment")
    complete_parser.add_argument("experiment_id", help="The experiment ID")
    complete_parser.add_argument(
        "conclusion",
        choices=["accepted", "rejected", "inconclusive"],
        help="Experiment conclusion",
    )

    args = parser.parse_args()

    tracker = HypothesisTracker()

    if args.command == "create":
        test_skus = [s.strip() for s in args.skus.split(",")]
        try:
            exp = tracker.create_experiment(
                hypothesis=args.hypothesis,
                prompt_changes=args.changes,
                test_skus=test_skus,
                baseline_version=args.baseline,
                challenger_version=args.challenger,
                allow_duplicates=args.allow_duplicates,
            )
            print(f"Created experiment: {exp.id}")
            print(f"Hypothesis: {exp.hypothesis}")
            print(f"Git commit: {exp.git_commit}")
        except ValueError as e:
            print(f"Error: {e}")
            return 1

    elif args.command == "list":
        experiments = tracker.list_experiments()
        if not experiments:
            print("No experiments found.")
        else:
            print(f"{'ID':<30} {'Status':<12} {'Conclusion':<12} {'Created':<20}")
            print("-" * 80)
            for exp in experiments:
                conclusion = exp.conclusion.value if exp.conclusion else "-"
                print(f"{exp.id:<30} {exp.status.value:<12} {conclusion:<12} {exp.created_at[:19]:<20}")

    elif args.command == "get":
        try:
            exp = tracker.get_experiment(args.experiment_id)
            print(f"ID: {exp.id}")
            print(f"Status: {exp.status.value}")
            print(f"Created: {exp.created_at}")
            print(f"Git commit: {exp.git_commit}")
            print(f"\nHypothesis: {exp.hypothesis}")
            print(f"\nPrompt Changes: {exp.prompt_changes}")
            print(f"\nTest SKUs: {', '.join(exp.test_skus)}")
            if exp.conclusion:
                print(f"\nConclusion: {exp.conclusion.value}")
        except KeyError:
            print(f"Experiment {args.experiment_id} not found.")
            return 1

    elif args.command == "complete":
        try:
            conclusion = ExperimentConclusion(args.conclusion)
            exp = tracker.complete_experiment(args.experiment_id, conclusion)
            print(f"Completed experiment: {exp.id}")
            print(f"Conclusion: {exp.conclusion.value}")
        except KeyError:
            print(f"Experiment {args.experiment_id} not found.")
            return 1

    else:
        parser.print_help()

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
