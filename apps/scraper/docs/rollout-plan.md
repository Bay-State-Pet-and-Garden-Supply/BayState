# crawl4ai Gradual Rollout Plan (All Scrapers)

## Executive Summary

This plan defines a controlled, phased migration of all 12 scraper workloads from legacy/browser-use execution to `crawl4ai`.

Goals:
- reduce extraction cost variance,
- improve consistency of schema completeness,
- preserve operational safety through batch gates and explicit rollback paths.

The rollout is intentionally progressive:
- **Phase 1** validates stability on low-risk targets (3 scrapers),
- **Phase 2** expands to medium-risk targets and validates cost outcomes (4 scrapers),
- **Phase 3** migrates high-value business scrapers (4 scrapers),
- **Phase 4** finalizes migration with cleanup/archive controls (1 scraper).

No scraper config files are modified during this plan definition; migration state is tracked through `scripts/migrate_all_scrapers.py` and generated reports.

## Scope and Inventory

Target inventory for rollout: **12 scrapers**

1. 4health
2. baystatepet
3. coastal
4. central_pet
5. mazuri
6. phillips
7. orgill
8. amazon
9. walmart
10. petfoodex
11. bradley
12. ai-template

## Rollout Phases

## Phase 1 — Low Risk Stability Gate (3 scrapers)

Scrapers:
- 4health
- baystatepet
- coastal

Primary objective:
- prove migration mechanics, state tracking, and observability with limited blast radius.

Gate to proceed:
- 24h monitoring window completed,
- no P1 incidents,
- success rate and completeness thresholds met.

## Phase 2 — Medium Risk + Cost Validation (4 scrapers)

Scrapers:
- central_pet
- mazuri
- phillips
- orgill

Primary objective:
- confirm expected cost behavior and acceptable operational reliability at moderate traffic.

Gate to proceed:
- 36h monitoring window completed,
- cost-per-SKU not worse than baseline,
- no unresolved rollback triggers.

## Phase 3 — High Value Business Migration (4 scrapers)

Scrapers:
- amazon
- walmart
- petfoodex
- bradley

Primary objective:
- migrate core business data sources after lower phases demonstrate safe performance.

Gate to proceed:
- 48h monitoring window completed,
- high-value SKU coverage remains within expected throughput,
- rollback readiness validated for each scraper.

## Phase 4 — Cleanup and Archive Completion (1 scraper)

Scraper:
- ai-template

Primary objective:
- finish migration inventory, freeze final state, and archive superseded legacy pathways.

Gate to close rollout:
- all 12 scrapers marked migrated,
- final verification command passes,
- post-rollout runbook published.

## Risk Assessment by Scraper

| Scraper | Phase | Risk | Why | Rollback Priority |
|---|---:|---|---|---|
| 4health | 1 | Low | Lower catalog complexity and limited dependency surface | Standard |
| baystatepet | 1 | Low | Internal/known source patterns and predictable selectors | Standard |
| coastal | 1 | Low | Stable extraction patterns and manageable SKU variety | Standard |
| central_pet | 2 | Medium | Moderate SKU diversity and occasional structure changes | Elevated |
| mazuri | 2 | Medium | Product variant normalization can regress schema completeness | Elevated |
| phillips | 2 | Medium | Vendor layout drift can increase parse error risk | Elevated |
| orgill | 2 | Medium | Larger category spread and catalog pagination sensitivity | Elevated |
| amazon | 3 | High | High anti-bot pressure and dynamic product page complexity | Immediate |
| walmart | 3 | High | Frequent markup changes and sponsored content interference | Immediate |
| petfoodex | 3 | High | High business impact despite moderate traffic volume | Immediate |
| bradley | 3 | High | Historical instability and high failure sensitivity | Immediate |
| ai-template | 4 | Low | Template workload used for final validation and cleanup controls | Standard |

## Rollback Procedures

Rollback trigger conditions:
- success rate drops below threshold for 2 consecutive monitoring intervals,
- schema completeness falls below required floor,
- cost-per-SKU exceeds phase budget envelope,
- blocker incident opened without mitigation inside SLA.

Rollback sequence (per impacted scraper):
1. execute `python scripts/migrate_all_scrapers.py rollback <scraper> --reason "<incident-id> <summary>"`
2. mark scraper as `rolled_back` in migration state and generate rollback report,
3. switch runtime traffic back to pre-migration engine path,
4. replay failed SKU window after control restoration,
5. open root-cause ticket and require explicit go/no-go review before retry.

Batch-level rollback decision:
- if two or more scrapers in the same phase trigger rollback within the same window, pause next phase and treat phase as failed pending remediation.

## Monitoring Checklist

- [ ] Per-scraper success/failure ratio captured every 15 minutes
- [ ] Median and p95 extraction latency tracked per scraper
- [ ] Required field completeness tracked (name, brand, price, images)
- [ ] Cost-per-SKU compared against pre-rollout baseline
- [ ] HTTP/navigation error classes grouped by scraper and phase
- [ ] Captcha/challenge encounter rate measured for high-risk sites
- [ ] On-call acknowledgment recorded before phase promotion
- [ ] Rollback drill command validated at least once before Phase 3

## Success Criteria

Rollout is considered complete only when all conditions pass:
- **Coverage:** 12/12 target scrapers marked migrated.
- **Reliability:** no open blocker incidents tied to migration.
- **Data quality:** required-field completeness at or above target thresholds.
- **Economics:** cost-per-SKU at or below approved budget envelope.
- **Control:** `verify` command reports success with zero blockers.
- **Auditability:** migration and rollback reports exist for executed actions.

## Operational Commands

Reference command set:

```bash
python scripts/migrate_all_scrapers.py status
python scripts/migrate_all_scrapers.py migrate-batch 1
python scripts/migrate_all_scrapers.py rollback walmart --reason "P1 schema regression"
python scripts/migrate_all_scrapers.py verify
```

Artifacts generated by tooling:
- state: `.sisyphus/state/crawl4ai_migration_state.json`
- reports: `.sisyphus/evidence/migration-reports/*.json`
