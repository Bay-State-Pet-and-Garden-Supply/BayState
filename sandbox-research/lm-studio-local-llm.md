# Research: LM Studio Local-Only Patterns for Python Structured Extraction

## Summary

LM Studio exposes a drop-in OpenAI-compatible API at `http://localhost:1234/v1` that works with the standard `openai` Python SDK. Structured output (JSON schema enforcement) is supported via `response_format` with `"type": "json_schema"` using grammar-based sampling (llama.cpp GGUF) or Outlines (MLX). No internet is required after initial model download; set `OPENAI_BASE_URL=http://localhost:1234/v1 OPENAI_API_KEY=lm-studio` as env vars and the SDK routes everything locally.

## Findings

1. **Two API surfaces exist — use the OpenAI-compatible `/v1/*` for portability.** LM Studio has a native REST API at `/api/v1/*` (stateful chats, MCP, etc.) and an OpenAI-compatible API at `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, `/v1/models`. For structured extraction with Python, the OpenAI-compatible path is simpler because it works with the familiar `openai` Python SDK — no library change needed. [Source](https://lmstudio.ai/docs/developer/openai-compat)

2. **`OPENAI_BASE_URL` env var is read by the OpenAI Python SDK — no code change needed.** The SDK constructor falls back to `OPENAI_BASE_URL` from the environment when `base_url` is not passed. Set `OPENAI_BASE_URL=http://localhost:1234/v1` and `OPENAI_API_KEY=lm-studio` (any non-empty string works; LM Studio ignores it locally) and `OpenAI()` with no args connects to your local server. [Source](https://github.com/openai/openai-python/issues/2927) | [Source](https://theneuralbase.com/sglang/learn/beginner/use-openai-client-with-base-url/)

3. **Explicit base_url in code is the documented LM Studio approach.** The official docs set `base_url="http://localhost:1234/v1"` directly on the `OpenAI` constructor. Use environment-based config when you want zero-code-change switching between local and cloud; use explicit when you need multiple clients or want to keep env vars unset. [Source](https://lmstudio.ai/docs/developer/openai-compat)

4. **Structured output uses `response_format` with `json_schema` type — mirrors OpenAI's Structured Outputs API.** The request body includes `"response_format": { "type": "json_schema", "json_schema": { "name": "...", "strict": true, "schema": {...} } }`. The response comes back as a JSON string in `choices[0].message.content`. LM Studio doesn't have a `"type": "json_object"` mode without schema (unlike OpenAI). [Source](https://lmstudio.ai/docs/developer/openai-compat/structured-output)

5. **Native LM Studio Python SDK (`lmstudio-python`) supports Pydantic natively.** The `model.respond()` method accepts `response_format=BookSchema` where `BookSchema` is a `pydantic.BaseModel`. The returned `.parsed` field is a typed dict matching the schema. This avoids manual JSON parsing but locks you into the LM Studio SDK. Use this when you want schema-in, typed-object-out without extra `json.loads()`. [Source](https://lmstudio.ai/docs/python/llm-prediction/structured-response)

6. **Grammar-based constraint generation under the hood — not heuristic post-processing.** For GGUF models, LM Studio uses llama.cpp's grammar-based sampling to enforce the schema token-by-token. For MLX models, it uses the Outlines library. This means structured output is more reliable than prompt-based JSON instructions, but not all models support it — especially models below 7B parameters. Test with your target model first. [Source](https://lmstudio.ai/docs/developer/openai-compat/structured-output)

7. **Headless/offline/server deployment is supported via `lms` CLI and `llmster` daemon.** Run `lms daemon up && lms server start` to start the server without the GUI. The `llmster` package supports headless CI/server deployments. The `api_key` is never sent to an external service — any value works. Telemetry in the desktop app can be disabled. [Source](https://lmstudio.ai/docs/developer)

8. **Supported request parameters match OpenAI's Chat Completions.** The following are recognized: `model`, `messages`, `temperature`, `max_tokens`, `top_p`, `top_k`, `stream`, `stop`, `presence_penalty`, `frequency_penalty`, `logit_bias`, `repeat_penalty`, `seed`. No `tools`/`tool_choice` support was confirmed for the OpenAI-compatible path (the native SDK supports tool calling). [Source](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)

9. **`strict: true` is supported in the JSON schema — analogous to OpenAI's strict mode.** The schema field includes `"strict": "true"` in the example. The implementation uses constrained decoding, not post-hoc validation, so `strict` affects how strictly the grammar is applied at generation time. [Source](https://lmstudio.ai/docs/developer/openai-compat/structured-output)

10. **Pydantic V3 strict mode may cause friction if you're using it for schema definitions.** The LM Studio SDK's `ModelSchema` protocol needs a `model_json_schema()` classmethod. Pydantic V3's strict mode can produce schemas with `"strict": true` at the field level, which some local LLM grammar engines handle poorly. If you hit schema rejection, use Pydantic V2 or a `msgspec`-based `lmstudio.BaseModel`. [Source](https://tech-champion.com/programming/python-programming/pydantic-v3-strict-mode-breaking-llm-structured-outputs-a-technical-guide/)

## Sources

### Kept
- **LM Studio OpenAI Compatibility Endpoints** (https://lmstudio.ai/docs/developer/openai-compat) — official docs, primary source for base_url setup and supported endpoints.
- **LM Studio Structured Output** (https://lmstudio.ai/docs/developer/openai-compat/structured-output) — primary source for JSON schema enforcement, curl/Python examples, engine details (llama.cpp grammar + Outlines).
- **LM Studio Python SDK — Structured Response** (https://lmstudio.ai/docs/python/llm-prediction/structured-response) — primary source for Pydantic integration with native SDK.
- **LM Studio Python SDK — Project Setup** (https://lmstudio.ai/docs/python/getting-started/project-setup) — server host config, client API host override.
- **LM Studio Developer Docs** (https://lmstudio.ai/docs/developer) — CLI commands, headless daemon, overall architecture.
- **LM Studio Chat Completions** (https://lmstudio.ai/docs/developer/openai-compat/chat-completions) — supported payload parameters, Python example.
- **LM Studio CLI** (https://lmstudio.ai/docs/cli) — `lms` commands for server/daemon/model management.
- **OpenAI Python SDK — base_url env var** (https://github.com/openai/openai-python/issues/2927) — confirms `OPENAI_BASE_URL` env var behavior.
- **OpenAI Python SDK README** (https://github.com/openai/openai-python) — confirms `OPENAI_BASE_URL` env var fallback in constructor.
- **Sglang Beginner Course (The Neural Base)** (https://theneuralbase.com/sglang/learn/beginner/use-openai-client-with-base-url/) — demonstrates env var pattern for local OpenAI-compatible servers.
- **LM Studio vs Ollama (Contra Collective)** (https://contracollective.com/blog/lm-studio-vs-ollama-local-llm-inference-2026) — useful comparison context; confirms port 1234 default, llama.cpp engine.

### Dropped
- **Pydantic V3 Strict Mode Breaking LLM Structured Outputs** (tech-champion.com) — relevant but secondary; caveat acknowledged.
- **DeepWiki / LM Studio docs summaries** — derivative content; primary docs already captured.
- **Ollama structured outputs docs** — out of scope (Ollama comparison only).
- **Various "Ollama vs LM Studio" blog posts** — same content repeated; only kept the most substantive one.

## Gaps

- **Tool calling/function calling with the OpenAI-compatible path** — not confirmed. The native SDK supports tools, but the OpenAI-compatible /v1/chat/completions docs don't list `tools` or `tool_choice` as supported params. Needs testing.
- **`strict: true` behavior differences between LM Studio and OpenAI** — both support it but the underlying mechanism (grammar-based vs OpenAI's constrained decoding) may produce different failure modes. Not documented.
- **`OPENAI_BASE_URL` empty-string edge case** — GitHub issue #2927 confirms a bug where `OPENAI_BASE_URL=""` prevents fallback to default; workaround is to unset the var. Minor but worth knowing.
- **Model identifier discovery** — the model identifier string needed in `model=` field varies. Use `lms ls` or hit `GET /v1/models` to list available models.

## Suggested next steps
1. Write a sandbox script that tests structured extraction with a small model (e.g., Qwen2.5-7B-Instruct-GGUF) through both the OpenAI-compatible and native SDK paths.
2. Verify tool calling support on the OpenAI-compatible path.
3. Test `strict: true` schema enforcement with nested objects and arrays.

## Implementation Quickstart

```bash
# Install & start
pip install openai lmstudio
lms daemon up             # headless daemon (skip if LM Studio desktop is running)
lms server start          # starts on :1234 by default
lms get qwen/qwen2.5-7b-instruct  # pull a model (or use LM Studio GUI)

# Quick test
python -c "
import openai
client = openai.OpenAI(base_url='http://localhost:1234/v1', api_key='lm-studio')
r = client.chat.completions.create(model='qwen2.5-7b-instruct',
  messages=[{'role':'user','content':'Say hello'}])
print(r.choices[0].message.content)
"
```

### Env var approach (portable between local/cloud):
```bash
export OPENAI_BASE_URL=http://localhost:1234/v1
export OPENAI_API_KEY=lm-studio
python -c "
import openai
client = openai.OpenAI()  # reads OPENAI_BASE_URL from env
r = client.chat.completions.create(model='qwen2.5-7b-instruct',
  messages=[{'role':'user','content':'Say hello'}])
print(r.choices[0].message.content)
"
```

### Structured extraction (OpenAI-compatible path):
```python
from openai import OpenAI
import json

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

response = client.chat.completions.create(
    model="qwen2.5-7b-instruct",
    messages=[
        {"role": "system", "content": "Extract structured data from user input."},
        {"role": "user", "content": "John Doe is 28 and lives in Boston."}
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "person",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "city": {"type": "string"}
                },
                "required": ["name", "age", "city"]
            }
        }
    },
    temperature=0.1,
)

data = json.loads(response.choices[0].message.content)
print(data)  # {'name': 'John Doe', 'age': 28, 'city': 'Boston'}
```

### Structured extraction (native LM Studio SDK path):
```python
import lmstudio as lms
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int
    city: str

with lms.Client() as client:
    model = client.llm.model("qwen2.5-7b-instruct")
    result = model.respond(
        "John Doe is 28 and lives in Boston.",
        response_format=Person,
    )
    print(result.parsed)  # typed dict: {"name": "...", "age": ..., "city": "..."}
```

### Offline verification (no network calls made):
```python
# Set a dummy API key to confirm no cloud calls
# Add a firewall rule or use --offline-mode if available
# Once models are downloaded, LM Studio never reaches out
# for inference requests — it's fully local.
```
