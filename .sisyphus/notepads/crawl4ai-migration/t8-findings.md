T8 Findings: YAML-to-crawl4ai Transpiler

Delivered
- Added core transpiler module at BayStateScraper/lib/transpiler/generator.py.
- Added package exports at BayStateScraper/lib/transpiler/__init__.py and lib/__init__.py.
- Added CLI entrypoint package at BayStateScraper/transpiler/__main__.py with command python -m transpiler migrate <config.yaml>.
- Added tests at BayStateScraper/tests/test_transpiler_generator.py.

Validation
- Static configs map to css/xpath/hybrid extraction schemas.
- Agentic configs map to llm payload with JSON schema and confidence settings.
- Unsupported actions and missing selectors are flagged for manual review, not hard-failed.

Coverage
- Total YAML files evaluated: 19
- Auto-transpiled without manual review: 17
- Manual review required: 2 (bradley.yaml, walmart.yaml)
- Failed transpilation: 0
- Automatic coverage: 89.47 percent

Verification
- LSP diagnostics (error severity) clean on changed files.
- pytest tests/test_transpiler_generator.py passed (5 passed).
- Evidence generated at .sisyphus/evidence/t8-transpiler-output.py.

Notes
- walmart.yaml requests field Images without matching selector; correctly flagged for manual review while output remains valid.
