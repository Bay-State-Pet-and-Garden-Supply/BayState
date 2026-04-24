"""Benchmark configuration with pydantic validation, YAML/JSON loading, and env var overrides."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_MODES = ("llm-free", "llm", "auto")
DEFAULT_MAX_URLS = 50
DEFAULT_TIMEOUT = 30
DEFAULT_CONCURRENCY = 5
DEFAULT_ITERATIONS = 3
DEFAULT_HEADLESS = True
DEFAULT_LLM_PROVIDER = "auto"
DEFAULT_LLM_MODEL: str | None = None
DEFAULT_MAX_COST_USD = 2.0
DEFAULT_AUTO_ACCEPTANCE_THRESHOLD = 0.8


# ---------------------------------------------------------------------------
# Specialized configs
# ---------------------------------------------------------------------------


class ExtractionBenchmarkConfig(BaseModel):
    """Configuration for extraction quality benchmarks.

    Measures accuracy, field coverage, and confidence scores
    across llm-free, llm, and auto extraction modes.
    """

    urls: list[str] = Field(default_factory=list, description="Product URLs to benchmark")
    modes: list[str] = Field(
        default_factory=lambda: ["auto"],
        description="Extraction modes to test: llm-free, llm, auto",
    )
    timeout: int = Field(default=DEFAULT_TIMEOUT, gt=0, description="Per-URL timeout in seconds")
    concurrency: int = Field(default=DEFAULT_CONCURRENCY, ge=1, description="Max concurrent extractions")
    iterations: int = Field(default=DEFAULT_ITERATIONS, ge=1, description="Iterations per URL per mode")
    headless: bool = Field(default=DEFAULT_HEADLESS, description="Run browser in headless mode")
    llm_provider: str = Field(default=DEFAULT_LLM_PROVIDER, description="LLM provider: auto, openai, gemini, openai_compatible")
    llm_model: str | None = Field(default=DEFAULT_LLM_MODEL, description="Optional LLM model override")
    max_cost_usd: float = Field(default=DEFAULT_MAX_COST_USD, ge=0, description="Abort if projected cost exceeds this")
    auto_acceptance_threshold: float = Field(
        default=DEFAULT_AUTO_ACCEPTANCE_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for auto mode fallback",
    )
    products_path: str | None = Field(default=None, description="Path to JSON products file (alternative to urls)")

    @field_validator("modes")
    @classmethod
    def validate_modes(cls, v: list[str]) -> list[str]:
        invalid = [m for m in v if m not in VALID_MODES]
        if invalid:
            raise ValueError(f"Invalid modes: {invalid}. Must be subset of {VALID_MODES}")
        return v

    @field_validator("urls")
    @classmethod
    def validate_urls_not_empty_when_no_products_path(cls, v: list[str], info: Any) -> list[str]:
        return v


class RankingBenchmarkConfig(BaseModel):
    """Configuration for search ranking benchmarks.

    Measures how well extraction results match ground truth
    rankings and relevance scores.
    """

    urls: list[str] = Field(default_factory=list, description="Product URLs to benchmark")
    modes: list[str] = Field(
        default_factory=lambda: ["auto"],
        description="Extraction modes to test",
    )
    timeout: int = Field(default=DEFAULT_TIMEOUT, gt=0, description="Per-URL timeout in seconds")
    concurrency: int = Field(default=DEFAULT_CONCURRENCY, ge=1, description="Max concurrent extractions")
    iterations: int = Field(default=DEFAULT_ITERATIONS, ge=1, description="Iterations per URL per mode")
    ranking_k: list[int] = Field(
        default_factory=lambda: [1, 3, 5, 10],
        description="K values for precision@k and recall@k metrics",
    )
    relevance_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum confidence to consider a result relevant",
    )

    @field_validator("modes")
    @classmethod
    def validate_modes(cls, v: list[str]) -> list[str]:
        invalid = [m for m in v if m not in VALID_MODES]
        if invalid:
            raise ValueError(f"Invalid modes: {invalid}. Must be subset of {VALID_MODES}")
        return v


class PerformanceBenchmarkConfig(BaseModel):
    """Configuration for performance benchmarks.

    Measures speed, memory usage, and throughput across
    extraction modes under various load conditions.
    """

    urls: list[str] = Field(default_factory=list, description="Product URLs to benchmark")
    modes: list[str] = Field(
        default_factory=lambda: ["llm-free", "llm", "auto"],
        description="Extraction modes to test",
    )
    timeout: int = Field(default=DEFAULT_TIMEOUT, gt=0, description="Per-URL timeout in seconds")
    concurrency: int = Field(default=DEFAULT_CONCURRENCY, ge=1, description="Max concurrent extractions")
    iterations: int = Field(default=DEFAULT_ITERATIONS, ge=1, description="Iterations per URL per mode")
    warmup_iterations: int = Field(
        default=1,
        ge=0,
        description="Warmup iterations (excluded from metrics)",
    )
    profile_memory: bool = Field(default=False, description="Enable memory profiling")
    max_memory_mb: float | None = Field(
        default=None,
        ge=0,
        description="Abort if memory exceeds this limit in MB",
    )

    @field_validator("modes")
    @classmethod
    def validate_modes(cls, v: list[str]) -> list[str]:
        invalid = [m for m in v if m not in VALID_MODES]
        if invalid:
            raise ValueError(f"Invalid modes: {invalid}. Must be subset of {VALID_MODES}")
        return v


# ---------------------------------------------------------------------------
# Top-level config
# ---------------------------------------------------------------------------


class BenchmarkConfig(BaseModel):
    """Unified benchmark configuration.

    Supports extraction, ranking, and performance benchmark types
    with YAML/JSON loading and environment variable overrides.

    Environment variables:
        BENCHMARK_TIMEOUT   - Override timeout (seconds)
        BENCHMARK_MAX_URLS  - Override max URL count
    """

    benchmark_type: Literal["extraction", "ranking", "performance"] = Field(
        default="extraction",
        description="Type of benchmark to run",
    )
    urls: list[str] = Field(default_factory=list, description="Product URLs to benchmark")
    modes: list[str] = Field(
        default_factory=lambda: ["auto"],
        description="Extraction modes to test: llm-free, llm, auto",
    )
    timeout: int = Field(default=DEFAULT_TIMEOUT, gt=0, description="Per-URL timeout in seconds")
    concurrency: int = Field(default=DEFAULT_CONCURRENCY, ge=1, description="Max concurrent extractions")
    iterations: int = Field(default=DEFAULT_ITERATIONS, ge=1, description="Iterations per URL per mode")
    headless: bool = Field(default=DEFAULT_HEADLESS, description="Run browser in headless mode")
    llm_provider: str = Field(default=DEFAULT_LLM_PROVIDER, description="LLM provider")
    llm_model: str | None = Field(default=DEFAULT_LLM_MODEL, description="Optional LLM model override")
    max_cost_usd: float = Field(default=DEFAULT_MAX_COST_USD, ge=0, description="Max projected cost in USD")
    auto_acceptance_threshold: float = Field(
        default=DEFAULT_AUTO_ACCEPTANCE_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for auto mode fallback",
    )
    products_path: str | None = Field(default=None, description="Path to JSON products file")
    output_path: str | None = Field(default=None, description="Report output path (.json or .md)")

    extraction: ExtractionBenchmarkConfig | None = Field(default=None, description="Extraction-specific overrides")
    ranking: RankingBenchmarkConfig | None = Field(default=None, description="Ranking-specific overrides")
    performance: PerformanceBenchmarkConfig | None = Field(default=None, description="Performance-specific overrides")

    @field_validator("modes")
    @classmethod
    def validate_modes(cls, v: list[str]) -> list[str]:
        invalid = [m for m in v if m not in VALID_MODES]
        if invalid:
            raise ValueError(f"Invalid modes: {invalid}. Must be subset of {VALID_MODES}")
        return v

    @model_validator(mode="after")
    def validate_urls_or_products_path(self) -> "BenchmarkConfig":
        """Ensure urls is non-empty when no products_path is provided."""
        if not self.urls and not self.products_path:
            raise ValueError("Either 'urls' or 'products_path' must be provided")
        return self

    def get_specialized_config(self) -> ExtractionBenchmarkConfig | RankingBenchmarkConfig | PerformanceBenchmarkConfig:
        """Return the specialized config for the current benchmark type."""
        if self.benchmark_type == "extraction":
            if self.extraction is not None:
                return self.extraction
            return ExtractionBenchmarkConfig(
                urls=self.urls,
                modes=self.modes,
                timeout=self.timeout,
                concurrency=self.concurrency,
                iterations=self.iterations,
                headless=self.headless,
                llm_provider=self.llm_provider,
                llm_model=self.llm_model,
                max_cost_usd=self.max_cost_usd,
                auto_acceptance_threshold=self.auto_acceptance_threshold,
                products_path=self.products_path,
            )
        elif self.benchmark_type == "ranking":
            if self.ranking is not None:
                return self.ranking
            return RankingBenchmarkConfig(
                urls=self.urls,
                modes=self.modes,
                timeout=self.timeout,
                concurrency=self.concurrency,
                iterations=self.iterations,
            )
        else:
            if self.performance is not None:
                return self.performance
            return PerformanceBenchmarkConfig(
                urls=self.urls,
                modes=self.modes,
                timeout=self.timeout,
                concurrency=self.concurrency,
                iterations=self.iterations,
            )


# ---------------------------------------------------------------------------
# Loading functions
# ---------------------------------------------------------------------------


def load_config(path: str | Path) -> BenchmarkConfig:
    """Load benchmark configuration from a YAML or JSON file.

    Supports environment variable overrides for:
        BENCHMARK_TIMEOUT  - Override timeout (seconds)
        BENCHMARK_MAX_URLS - Truncate URL list to this count

    Args:
        path: Path to a YAML (.yml/.yaml) or JSON (.json) config file.

    Returns:
        Validated BenchmarkConfig instance.

    Raises:
        FileNotFoundError: If the config file does not exist.
        ValueError: If the config fails validation.
    """
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    raw_text = config_path.read_text(encoding="utf-8")

    if config_path.suffix.lower() in (".yml", ".yaml"):
        data = yaml.safe_load(raw_text)
    elif config_path.suffix.lower() == ".json":
        data = json.loads(raw_text)
    else:
        try:
            data = yaml.safe_load(raw_text)
        except yaml.YAMLError:
            data = json.loads(raw_text)

    if not isinstance(data, dict):
        raise ValueError(f"Config file must contain a mapping, got {type(data).__name__}")

    data = _apply_env_overrides(data)

    return BenchmarkConfig.model_validate(data)


def _apply_env_overrides(data: dict[str, Any]) -> dict[str, Any]:
    """Apply environment variable overrides to config data.

    Supported env vars:
        BENCHMARK_TIMEOUT  - Override timeout (must be positive int)
        BENCHMARK_MAX_URLS - Truncate URL list to this count
    """
    data = dict(data)

    env_timeout = os.environ.get("BENCHMARK_TIMEOUT")
    if env_timeout is not None:
        try:
            timeout = int(env_timeout)
            if timeout <= 0:
                raise ValueError("BENCHMARK_TIMEOUT must be a positive integer")
            data["timeout"] = timeout
        except ValueError:
            raise ValueError(f"Invalid BENCHMARK_TIMEOUT: {env_timeout!r}. Must be a positive integer")

    env_max_urls = os.environ.get("BENCHMARK_MAX_URLS")
    if env_max_urls is not None:
        try:
            max_urls = int(env_max_urls)
            if max_urls <= 0:
                raise ValueError("BENCHMARK_MAX_URLS must be a positive integer")
            urls = data.get("urls", [])
            if isinstance(urls, list) and len(urls) > max_urls:
                data["urls"] = urls[:max_urls]
        except ValueError:
            raise ValueError(f"Invalid BENCHMARK_MAX_URLS: {env_max_urls!r}. Must be a positive integer")

    return data


def get_default_config() -> BenchmarkConfig:
    """Return a BenchmarkConfig with sensible defaults.

    The default config uses:
        - 50 sample product URLs
        - All three extraction modes (llm-free, llm, auto)
        - 30s timeout
        - Concurrency of 5
        - 3 iterations per URL per mode

    Note: The default config includes sample URLs for testing.
    For production use, provide your own URLs via config file or products_path.
    """
    return BenchmarkConfig(
        benchmark_type="extraction",
        urls=_default_urls(),
        modes=list(VALID_MODES),
        timeout=DEFAULT_TIMEOUT,
        concurrency=DEFAULT_CONCURRENCY,
        iterations=DEFAULT_ITERATIONS,
        headless=DEFAULT_HEADLESS,
        llm_provider=DEFAULT_LLM_PROVIDER,
        llm_model=DEFAULT_LLM_MODEL,
        max_cost_usd=DEFAULT_MAX_COST_USD,
        auto_acceptance_threshold=DEFAULT_AUTO_ACCEPTANCE_THRESHOLD,
    )


def _default_urls() -> list[str]:
    """Generate a list of default sample URLs for testing.

    Returns 50 sample product URLs from common pet supply retailers.
    These are placeholder URLs for config validation testing.
    """
    base_urls = [
        "https://www.chewy.com/dp/{i}",
        "https://www.petsmart.com/product/{i}",
        "https://www.petco.com/product/{i}",
        "https://www.tractorsupply.com/product/{i}",
        "https://www.walmart.com/ip/{i}",
    ]
    return [template.format(i=i) for i in range(1, 51) for template in [base_urls[(i - 1) % len(base_urls)]]][:DEFAULT_MAX_URLS]
