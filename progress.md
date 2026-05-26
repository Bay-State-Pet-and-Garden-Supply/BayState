# Progress

## Status
In Progress

## Tasks
- [x] Research LM Studio local-only patterns for Python structured extraction
  - [x] OpenAI-compatible API setup (base_url, env vars, port 1234)
  - [x] Structured output via response_format / json_schema
  - [x] Native Python SDK (lmstudio-python) with Pydantic
  - [x] Offline/headless deployment (lms CLI, llmster daemon)
  - [x] Caveats: model size <7B, strict mode, Pydantic V3 compatibility

## Files Changed
- Created `sandbox-research/lm-studio-local-llm.md` — full research brief with implementation quickstart, structured extraction examples for both OpenAI-compat and native SDK paths, and env var patterns.

## Notes
- LM Studio exposes two API surfaces: native v1 REST and OpenAI-compatible `/v1/*`. The OpenAI-compatible path is the most portable for structured extraction.
- `OPENAI_BASE_URL` env var is read by the OpenAI Python SDK — allows zero-code-change switching between local LM Studio and cloud.
- Structured output uses llama.cpp grammar-based sampling (GGUF) or Outlines (MLX) — not heuristic post-processing.
- Models below 7B parameters may not support structured output reliably.
