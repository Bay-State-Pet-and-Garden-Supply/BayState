# Browser Profile data stays in runner runtime storage

The web coordinator stores Browser Profile registry and setup-request state, while scraper runner/runtime storage owns the actual Crawl4AI browser profile data such as `user_data_dir`, cookies, local storage, and session files. Extraction jobs reference validated Browser Profile registry records, and runners resolve those references to local secure profile storage, keeping sensitive and environment-specific identity state out of Supabase and out of job payloads. When a Source marks a Browser Profile as required, missing, stale, or failed profile validation fails closed with access/identity attention rather than falling back to no-profile crawling.

**Status**: accepted
