# CRAWL4AI ENGINE

**Scope:** v0.3.0 extraction engine — LLM-free, LLM, and auto modes with anti-bot stealth

## STRUCTURE
```
crawl4ai_engine/
├── engine.py              # Crawl4AIEngine — async orchestrator, fallback chain
├── anti_bot.py            # AntiBotConfigGenerator — fingerprint/UA rotation
├── retry.py               # CircuitBreaker + exponential backoff + error classification
├── callback.py            # HMAC-signed result submission to coordinator
├── config.py              # YAML config loading and hierarchical merging
├── metrics.py             # Crawl4AIMetricsCollector — perf, cost, anti-bot stats
├── metrics_endpoint.py    # HTTP /metrics endpoint (Prometheus)
├── types.py               # Crawl config, result, engine setting types
├── strategies/            # Extraction strategy implementations
│   ├── base.py            # BaseExtractionStrategy (abstract)
│   ├── css_strategy.py    # CSS selector extraction
│   └── xpath_strategy.py  # XPath selector extraction
└── transpiler/            # YAML migration tooling
    ├── yaml_parser.py     # Config parser with unsupported feature detection
    ├── schema_generator.py # Schema from parsed YAML
    └── cli.py             # CLI tools
```

## EXTRACTION MODES
| Mode | Speed | Cost | When |
|------|-------|------|------|
| **LLM-Free** | 2-4s | $0 | Structured pages, e-commerce |
| **LLM** | 8-15s | $0.01-0.05 | Complex/unstructured data |
| **Auto** | 2-8s | Varies | Default — tries LLM-free first, falls back |

Fallback chain: LLM-free → LLM → Static selectors → Manual review

## KEY CLASSES
- **Crawl4AIEngine**: Async context manager. Crawl execution, result normalization, fallback escalation.
- **AntiBotConfigGenerator**: Browser fingerprint pools, UA rotation, proxy support, Chrome stealth flags.
- **CircuitBreaker**: Failure threshold + cooldown. Prevents cascade failures.
- **Crawl4AIMetricsCollector**: Thread-safe. Per-site performance, cost tracking, Prometheus export.

## INTEGRATION
- Uses `AsyncWebCrawler` from crawl4ai library
- Error classification from `core.failure_classifier` and `scrapers.exceptions`
- Results via `callback.py` with HMAC-SHA256 signatures
- Config from `scrapers/configs/*.yaml` (API-published at runtime)

## ANTI-PATTERNS
- **NO** sync operations (async-only engine)
- **NO** direct DB access (callback API only)
- **NO** hardcoded extraction logic (use strategies + YAML config)
- **NO** skipping anti-bot for production crawls

## RELATED
- Parent: `../../AGENTS.md` (scraper root)
- Core retry: `../../core/AGENTS.md`
- Action handlers: `../../scrapers/actions/AGENTS.md`
