# Separate AI Settings for Consolidation and Scraping

## Objective
Separate the AI operations settings into two distinct configurations and UI components on the Settings page: one for AI Scraping and one for AI Consolidation. This will allow setting the `llm_model` (and other parameters like `confidence_threshold`) individually for each operation.

## Key Files & Context
- `apps/web/lib/ai-scraping/credentials.ts`: Currently handles reading/writing `ai_scraping_defaults`. Needs to be updated or augmented to handle `ai_consolidation_defaults`.
- `apps/web/lib/consolidation/openai-client.ts`: `getConsolidationConfig()` currently reads from `getAIScrapingDefaults()`. This needs to read from the new consolidation defaults.
- `apps/web/app/api/admin/ai-scraping/credentials/route.ts`: API endpoint fetching and saving settings. Needs to support both scraping and consolidation defaults.
- `apps/web/components/admin/settings/AIScrapingCredentialsCard.tsx`: The current combined component.
- `apps/web/app/admin/settings/page.tsx`: The settings page rendering the components.

## Implementation Steps

### 1. Backend Data & Access Layer
- **Types & Defaults:**
  - Create a new type `AIConsolidationDefaults` with `llm_model` and `confidence_threshold`.
  - Leave `AIScrapingDefaults` as is (it includes `llm_model`, `max_search_results`, `max_steps`, `confidence_threshold`).
- **Database Operations (e.g., in `lib/ai-scraping/credentials.ts` or new `lib/consolidation/settings.ts`):**
  - Implement `getAIConsolidationDefaults()` to fetch the `ai_consolidation_defaults` key from `site_settings`. If missing, return default values (e.g., `gpt-4o-mini`, `0.7`).
  - Implement `upsertAIConsolidationDefaults(partial)` to save updates to the `ai_consolidation_defaults` key.
- **Consolidation Client Update:**
  - In `lib/consolidation/openai-client.ts`, update `getConsolidationConfig()` to await `getAIConsolidationDefaults()` instead of `getAIScrapingDefaults()`.

### 2. API Endpoint Update
- **Update `app/api/admin/ai-scraping/credentials/route.ts`:**
  - **GET**: Fetch and return both `scrapingDefaults` (from `getAIScrapingDefaults`) and `consolidationDefaults` (from `getAIConsolidationDefaults`).
  - **POST**: Accept `scrapingDefaults` and `consolidationDefaults` in the request body. Update the respective keys in the database using the new upsert functions.

### 3. Frontend Component Split
- **Component 1: `AIScrapingSettingsCard` (rename/refactor existing component):**
  - Handles OpenAI API Key, Brave API Key, and Scraping-specific settings: Default Model, Max Search Results, Max Steps, and Scraping Confidence Threshold.
  - Posts updates for `scrapingDefaults` and keys to the API.
- **Component 2: `AIConsolidationSettingsCard` (new component):**
  - Handles Consolidation-specific settings: Default Model and Consolidation Confidence Threshold.
  - Posts updates for `consolidationDefaults` to the API.
- **Update Settings Page:**
  - In `app/admin/settings/page.tsx`, replace the old `AIScrapingCredentialsCard` with the two new cards: `AIScrapingSettingsCard` and `AIConsolidationSettingsCard`.

## Verification & Testing
- Load the Settings page (`/admin/settings`) and verify that both cards appear.
- Change the `llm_model` for Consolidation to `gpt-4o` and the `llm_model` for Scraping to `gpt-4o-mini`. Save both cards.
- Refresh the page and verify both settings persisted independently.
- Check the `site_settings` table in Supabase to ensure `ai_scraping_defaults` and `ai_consolidation_defaults` exist as distinct keys with correct values.
- Verify that `getConsolidationConfig()` correctly retrieves the new consolidation-specific model and threshold during batch consolidation dry-runs.