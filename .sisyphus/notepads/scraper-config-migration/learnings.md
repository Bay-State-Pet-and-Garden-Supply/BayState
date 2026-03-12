- Added endpoint to resolve encrypted scraper credentials for runners.
- Followed existing AI provider credential encryption pattern (AES-256-GCM, key from AI_CREDENTIALS_ENCRYPTION_KEY).
- Verified API key validation uses validateRunnerAuth from lib/scraper-auth.
- Ensured no plaintext credentials are logged and internal errors are not exposed.

- Export script created at apps/web/scripts/export-configs-to-yaml.ts and used assembleScraperConfigBySlug to produce YAMLs.
