# T14: Migration Guide Findings

**Task**: Write migration guide explaining the switch from GitHub Actions to direct Docker-based runners with polling/realtime. Document new crawl4ai architecture, troubleshooting, FAQ, rollback instructions.

**Completed**: 2026-02-27

## Summary

Created comprehensive migration guide at `docs/MIGRATION.md` covering the full migration from GitHub Actions to direct Docker runners.

## Research Sources

Reviewed existing documentation:
- `BayStateApp/docs/runner-setup.md` - One-line installer process
- `BayStateScraper/docs/ARCHITECTURE.md` - API-driven architecture
- `BayStateScraper/docs/API_PROPOSAL.md` - Runner/coordinator API contract
- `BayStateScraper/runner/AGENTS.md` - Execution modes (full, chunk, realtime)
- `docs/scraper-studio/migration-guide.md` - Existing migration guide format
- `BayStateScraper/README.md` - v0.2.0 features and environment variables
- `BayStateScraper/AGENTS.md` - Coordinator-runner pattern

## Guide Structure

The migration guide includes:

### 1. Overview (Why Migrate)
- GitHub Actions limitations (queue delays, rate limiting, cost)
- Direct runner benefits (instant startup, cost reduction, crawl4ai)
- crawl4ai engine benefits (retry logic, anti-detection, extraction strategies)

### 2. Prerequisites
- BayStateApp requirements
- Runner machine requirements (Docker, hardware specs)
- Knowledge requirements

### 3. Architecture Changes
- Before/after diagrams showing GitHub Actions vs Direct Runners
- Comparison table highlighting key differences

### 4. Step-by-Step Migration
- Phase 1: Prepare coordinator (4 steps)
- Phase 2: Deploy first runner (3 steps)
- Phase 3: Test the runner (3 steps)
- Phase 4: Migrate production (parallel approach)

### 5. Direct Runner Setup
- Environment variables reference table
- Three deployment patterns (single, multi-runner, distributed)

### 6. Troubleshooting
- 5 common issues with diagnostic steps and solutions:
  - Runner shows offline
  - Jobs not being picked up
  - crawl4ai engine crashes
  - Realtime connection failing
  - Results not appearing

### 7. FAQ
- 18 questions covering:
  - General questions (5)
  - crawl4ai questions (3)
  - Security questions (3)
  - Operational questions (4)
  - Migration questions (3)

### 8. Rollback Instructions
- 5-step rollback process
- Emergency quick rollback command
- Partial rollback option

## Key Technical Details Documented

### Environment Variables
| Variable | Purpose |
|----------|---------|
| SCRAPER_API_URL | BayStateApp base URL |
| SCRAPER_API_KEY | Runner API key (bsr_...) |
| RUNNER_NAME | Unique identifier |
| POLL_INTERVAL | Polling frequency (default 30s) |
| MAX_JOBS_BEFORE_RESTART | Memory hygiene (default 100) |
| BSR_SUPABASE_REALTIME_KEY | Service role key for websocket |
| HEADLESS | Browser visibility mode |

### API Endpoints
- `GET /api/scraper/v1/poll` - Job discovery
- `POST /api/scraper/v1/heartbeat` - Health check
- `POST /api/admin/scraping/callback` - Results submission

### Migration Timeline
- Week 1-2: Parallel running (10% to direct runners)
- Week 3: 50% traffic to direct runners
- Week 4: 100% migration complete

## Architecture Comparison

### GitHub Actions
- Startup: 1-5 minutes
- Authentication: GitHub token
- Environment: Fresh VM per run
- Scaling: Workflow edits

### Direct Runners
- Startup: Instant (always running)
- Authentication: API key (bsr_...)
- Environment: Persistent Docker container
- Scaling: One command per machine

## crawl4ai Features Documented

- Automatic retry logic with exponential backoff
- Anti-detection (user agents, fingerprints)
- Multiple extraction strategies (CSS, XPath, LLM)
- Smart fallback mechanisms
- Structured JSON logging
- Memory management with auto-restart

## Files Created

1. `docs/MIGRATION.md` - Main migration guide (838 lines)
2. `.sisyphus/evidence/t14-guide.md` - QA evidence (this document)
3. `.sisyphus/notepads/crawl4ai-migration/t14-findings.md` - This file

## QA Verification

- [x] Overview section explains why migrate
- [x] Prerequisites clearly listed
- [x] Step-by-step migration documented
- [x] Direct runner setup documented
- [x] Troubleshooting section with 5 issues
- [x] FAQ with 18 questions (exceeds 10+ requirement)
- [x] Rollback instructions included
- [x] crawl4ai architecture documented
- [x] Examples provided throughout
- [x] Links to additional resources

## Anti-AI-Slop Compliance

- No em dashes or en dashes used
- No AI-sounding phrases (delve, robust, streamline, etc.)
- Plain words used (use not utilize, start not commence)
- Contractions used naturally (don't, it's)
- Varied sentence length
- No consecutive sentences start with same word
- No filler openings
- Human-readable prose

## Notes

The migration guide is designed to be accessible to both technical and non-technical users. It includes command examples, expected outputs, and clear explanations of technical concepts. The phased migration approach minimizes risk by allowing parallel operation during transition.

All existing documentation was reviewed to ensure accuracy and consistency with the current architecture. The guide references existing files where appropriate to avoid duplication.
