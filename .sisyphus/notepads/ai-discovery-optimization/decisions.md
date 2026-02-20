

## 2026-02-20: Prompt v2 focus decisions
- Prioritize Prompt v2 changes on crawl4ai source selection rubric and hard extraction completion policy before variant polishing.
- Use Brave query templating with SKU + inferred brand tokens and domain-tier ranking to reduce low-quality source picks.
- Add explicit extraction fallback behavior (alternate candidate) when required fields remain missing.

## 2026-02-20: Runner key storage architecture for AI scraping
- Current state from migrations:
  - `site_settings` stores generic JSON config by unique `key` (currently campaign banner) and is suitable for non-secret UI/admin settings.
  - `scraper_runners` tracks runner presence/metadata and active job context.
  - `runner_api_keys` already implements hashed API keys (`key_hash`) for runner authentication only; plaintext is intentionally not stored.
- Decision: **Do not store `OPENAI_API_KEY` or `BRAVE_API_KEY` in `runner_api_keys`** (wrong purpose) and avoid plaintext secrets in `site_settings.value`.
- Recommended storage:
  - Use a dedicated secrets store pattern in Supabase backed by encryption-at-rest (Vault/pgsodium-style encrypted secrets table managed by service role only).
  - Keep `site_settings` for non-secret feature flags only (e.g., `ai_scraping.enabled`, provider selection, model defaults), but keep provider credentials out of it.
- Runner delivery pattern:
  - Runners continue authenticating with `X-API-Key` (`runner_api_keys` validation).
  - After auth, BayStateApp fetches provider secrets server-side with service role permissions and injects ephemeral credentials into job execution context (dispatch payload/env) without persisting plaintext in runner DB tables.
  - Prefer short-lived delivery per job: decrypt at dispatch time, pass only required keys (`OPENAI_API_KEY`, `BRAVE_API_KEY`), and never echo/log values.
- Admin implications:
  - Admin UI should manage secret references/rotation actions, last-updated metadata, and validation status—not display raw keys after save.
  - Show masked previews (e.g., `sk-...abcd`), support rotate/revoke workflow, and separate “AI scraping config” (site settings) from “AI provider credentials” (vault-backed secrets).
