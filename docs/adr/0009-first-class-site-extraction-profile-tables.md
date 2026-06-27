# Site Extraction Profiles use first-class coordinator tables

Site Extraction Profiles, Profile Versions, Explicit Corrections, Profile Validation Sets, and Search Observations are stored as first-class coordinator database records instead of being embedded in `brand_sources.metadata`. This keeps the profile lifecycle versioned, auditable, testable, reviewable, and rollback-friendly while allowing `brand_sources` to remain the source policy/configuration table rather than a blob store for extraction knowledge.

**Status**: accepted
