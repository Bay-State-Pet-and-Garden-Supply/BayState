# Coordinator embeds Site Extraction Profile versions in extraction jobs

The coordinator is the source of truth for Site Extraction Profiles and resolves the active Profile Version before creating extraction jobs. Scraper runners receive a full immutable snapshot of the resolved profile version in the job/source-plan payload, including profile identifiers, version identifier, version hash, and rules snapshot. Runners execute that exact snapshot instead of querying Supabase directly, preserving the API-only runner boundary and making extraction attempts replayable even if profiles change later.

**Status**: accepted
