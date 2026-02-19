# Issues - Scraper Config Architecture Redesign

## [2026-01-22] Session Start

### Known Issues (from Metis Review)

1. **Admin Panel Incoherence**
   - Issue: Admin Panel is incoherent and appears to parse configs incorrectly
   - Impact: Users cannot reliably create/edit configurations
   - Status: Pending investigation (Task 1)

2. **Runner Swallows Config Errors**
   - Issue: Runner may swallow config parsing errors and continue
   - Impact: Silent failures waste resources and hide problems
   - Status: Pending investigation (Task 2)

3. **Editing Races vs Runner Fetch**
   - Issue: Potential race condition when editing while runner fetches
   - Mitigation: Published versions immutable; drafts not visible to runners
   - Status: Design addressed, implementation pending

4. **Publish Invalid Configs**
   - Issue: Could accidentally publish invalid configurations
   - Mitigation: Validate before publish; publish only if valid
   - Status: Design addressed, implementation pending

5. **DB Downtime at Runner Start**
   - Issue: Runner fails if DB unavailable at job start
   - Mitigation: Fail fast with clear error; operator can retry
   - Status: Design addressed, implementation pending

6. **Schema Evolution**
   - Issue: Backward compatibility when schema versions change
   - Mitigation: Versioned schema with explicit `schema_version` field
   - Status: Design addressed, implementation pending

---

## To Be Populated During Execution

_Track problems encountered and their resolutions_
