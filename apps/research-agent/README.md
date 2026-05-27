# `@baystate/research-agent`

Self-sufficient product research agent CLI for turning product identity details into evidence-backed storefront product drafts.

## Purpose

`apps/research-agent` is becoming the **agent-native research pipeline** for product-page discovery, page acquisition, extraction, verification, Pi adjudication, and storefront draft assembly.

It does **not** own:
- database writes
- Supabase migrations
- admin UI
- frontend publishing

It does own:
- product research input parsing
- candidate discovery/scoring contracts
- page acquisition/extraction pipeline ports
- deterministic guardrails and evidence validation
- Pi/LM Studio structured adjudication
- structured `ProductResearchReport` generation
- `StorefrontProductDraft` generation
- local artifact output for benchmarking and review

This follows the repo boundary:
- `apps/web` = coordinator, persistence, admin UI, eventual review/publish surface
- `apps/scraper` = legacy Python extraction/browser runner; not the target dependency for this app
- `apps/research-agent` = self-sufficient research, validation, agent adjudication, and storefront draft generation

## Current MVP scope

- CLI-only Bun/TypeScript app
- Scores provided candidate URLs for a product
- Selects or flags the best candidate
- Emits grounded JSON + markdown artifacts locally
- Writes an initial `storefront-product.json` draft next to each report
- Supports opt-in legacy scraper extraction through a narrow JSON adapter interface for comparison only
- Includes a standalone Pi SDK harness that runs entirely inside `apps/research-agent`

## Usage

From the repo root:

```bash
bun run research-agent research-product --input examples/fromm-duck.json
```

Or from this app directory:

```bash
bun run research-product --input examples/fromm-duck.json
```

The bundled `examples/fromm-duck.json` now uses real Serper.dev-derived candidate URLs from `serp_results.json` instead of fabricated test pages.

Optional output directory override:

```bash
bun run research-product --input examples/fromm-duck.json --output-dir artifacts/manual-run
```

Opt-in scraper extraction through the Python known-url wrapper:

```bash
bun run research-product --input examples/fromm-duck.json --use-scraper
```

Bootstrap the standalone Pi harness for a local LM Studio server:

```bash
bun run agent-bootstrap-lmstudio --model-id qwen3.6-35b-a3b
```

Inspect the standalone Pi harness environment:

```bash
bun run agent-env
```

Run the standalone Pi harness around the deterministic workflow:

```bash
bun run agent-research-product --input examples/fromm-duck.json
```

Run a read-only live sample batch from the linked Supabase project:

```bash
bun run live-sample-research --limit 5 --agent --output-dir artifacts/live-smoke
```

Live batches keep per-sample Pi assistant output quiet by default and save it under each sample's `agent-summary.md` / `agent-details.json`; pass `--verbose-agent` when you want to stream each sample's reasoning while the batch runs.

With explicit model + scraper wrapper:

```bash
bun run agent-research-product \
  --input examples/fromm-duck.json \
  --model anthropic/claude-sonnet-4-20250514 \
  --thinking low \
  --use-scraper
```

## Artifact output

Each deterministic run writes:
- `input.json`
- `report.json`
- `summary.md`
- `storefront-product.json`

The standalone Pi harness writes those files plus:
- `agent-summary.md`
- `agent-details.json`

`report.json` now also embeds the structured Pi `agentDecision` when the standalone harness records a final choice or defer decision.

under `apps/research-agent/artifacts/<timestamp>-<product-id>/` by default.

## Agent-native pipeline architecture

See `docs/self-sufficient-pipeline.md` for the target architecture.

Near-term direction:
- keep deterministic scoring as a guardrail
- move new capability behind `src/pipeline` ports/stages
- build native page acquisition and extraction inside this app
- use the project-local `agent-browser` skill for browser/page-acquisition research
- use Pi tools to orchestrate bounded research steps and record structured decisions
- output `ProductResearchReport` plus `StorefrontProductDraft`

### Browser automation skill

The Vercel `agent-browser` skill is installed project-locally under `skills/agent-browser` and tracked in `skills-lock.json`.
The standalone Pi resource loader exposes only this skill to the research-agent harness for browser automation work.

Before using browser commands, the Pi agent should load the current CLI-matched workflow content:

```bash
agent-browser skills get core
```

For fuller command references:

```bash
agent-browser skills get core --full
```

## Legacy scraper wrapper contract

The current optional scraper integration is a compatibility bridge, not the target architecture.
The app still does **not** import Python internals directly from TypeScript.
Instead, the optional legacy integration uses a narrow JSON boundary:

```txt
stdin  -> { url, upc, brand, registerName, expectedAttributes }
stdout -> { status, extracted, warnings, error? }
```

That wrapper lives on the scraper side and calls `ProductPageExtractor` safely.
Do not expand this path for new research-agent-native pipeline work.
Current entry points:

```bash
uv run --with-requirements requirements.txt python apps/scraper/scripts/known_url_extract.py --stdin
bun --cwd apps/scraper run extract:known-url
```

## Standalone Pi harness

The Pi harness is intentionally scoped to a **local, standalone environment** first.
It does **not** wire into `apps/web`, queues, Supabase, or frontend surfaces.

Current behavior:
- uses the Pi SDK `createAgentSession()` inside `apps/research-agent`
- keeps Pi runtime files under `apps/research-agent/.pi-runtime/` by default
- uses a bounded toolset: `read`, `grep`, `find`, `ls`, `run_product_research`, and `record_agent_decision`
- executes the existing deterministic `runProductResearch()` flow instead of replacing it
- requires Pi to record a structured final decision after each standalone harness run
- writes Pi-specific run artifacts next to the normal research report artifacts

Environment controls:
- `RESEARCH_AGENT_PI_HOME` — override the local Pi runtime directory
- `RESEARCH_AGENT_PI_MODEL` — default Pi model as `<provider>/<model-id>`
- `RESEARCH_AGENT_PI_THINKING` — thinking level override (`off|minimal|low|medium|high|xhigh`)
- `LMSTUDIO_BASE_URL` — optional LM Studio base URL override for bootstrapping
- standard provider env vars still apply (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)

### `auth.json` vs `models.json`

For local LM Studio usage:
- `auth.json` can be minimal and just store the provider key name/value
- `models.json` is the important file because it defines the custom `lmstudio` provider and model list

Example `auth.json`:

```json
{
  "lmstudio": { "type": "api_key", "key": "lm-studio" }
}
```

Example `models.json`:

```json
{
  "providers": {
    "lmstudio": {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "api": "openai-completions",
      "apiKey": "lm-studio",
      "models": [
        {
          "id": "qwen3.6-35b-a3b",
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

The `agent-bootstrap-lmstudio` command writes both files into `.pi-runtime/` and auto-detects the actual model IDs exposed by LM Studio.

## Live sample workflow

The `live-sample-research` command is a **read-only local benchmarking workflow**.
It does not add frontend routes, coordinator jobs, or database writes.
It shells out to the Supabase CLI (`bunx supabase db query --linked`) from the linked web workspace and converts current `official_brand_url_candidates` rows into local research-agent inputs.

Environment/setup notes:
- the Supabase CLI must be available through `bunx supabase`
- the linked project metadata must exist under `apps/web/supabase/.temp/`, or set `RESEARCH_AGENT_SUPABASE_PROJECT_REF`
- optional: set `RESEARCH_AGENT_SUPABASE_WORKDIR` if your linked Supabase workspace is not `apps/web`
- live batch artifacts are written under `apps/research-agent/artifacts/` and should stay local

This keeps live sampling local and read-only. Frontend integration remains deferred until the self-sufficient pipeline and artifact contract stabilize.
