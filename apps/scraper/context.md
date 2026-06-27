# Scraper Extraction Context

This context describes the language used for BayState product page extraction and scraping strategy discussions.

## Language

**Browser Profile**:
A persistent browser identity for a site, including cookies, local storage, authentication state, and regional/browser preferences.
_Avoid_: Profile, cache, session

**Site Extraction Profile**:
A durable site-specific body of extraction knowledge for a brand, source, and domain.
_Avoid_: Profile, browser profile, cache

**Source**:
A configured product-data origin for a brand, such as an official site, distributor, marketplace, or licensed feed.
_Avoid_: Provider, scraper

**Page Cache**:
A stored crawl result reused to avoid fetching the same page again.
_Avoid_: Profile, browser profile

**Commerce Platform**:
The storefront technology family a site runs on, such as Shopify or WooCommerce.
_Avoid_: Provider, profile

**Field Evidence Rule**:
A reusable rule that describes acceptable evidence for extracting one product field on a site.
_Avoid_: Selector, hint

**Field Evidence Provenance**:
The field-level record of which rule, selector, source URL, and fallback method produced an extracted value.
_Avoid_: Logs, telemetry

**Image Candidate**:
A normalized possible product image with URL, source, DOM context, scoring, and rejection evidence.
_Avoid_: Image URL, media dict

**Field Quality Gate**:
A field-level acceptance check that determines whether extracted evidence is usable.
_Avoid_: Result status, confidence score

**Explicit Correction**:
A deliberate field-level human correction that identifies the right or wrong evidence for an extracted product field.
_Avoid_: Approval, review, feedback

**Profile Version**:
A reviewable revision of a Site Extraction Profile's field evidence rules.
_Avoid_: Metadata blob, config snapshot

**Search Observation**:
A normalized record of search-provider evidence gathered while discovering product URLs.
_Avoid_: Raw Serper payload, profile rule, extraction profile

**Profile Validation Set**:
A curated set of product URLs and field assertions used to test a Profile Version.
_Avoid_: Test cache, sample pages

**AI Schema Draft**:
An AI-generated starting proposal for Field Evidence Rules for a site.
_Avoid_: Active profile, final schema

**Product Detail Page**:
A page for one specific product or product variant on a source domain.
_Avoid_: PDP, listing page, category page

**Profile Maintenance Workflow**:
A human-governed review workflow for creating, testing, and approving Profile Versions.
_Avoid_: Extraction job, automatic scrape

**Brand Source Setup**:
A guided preparation workflow for making a brand Source ready for reliable extraction.
_Avoid_: Brand edit, scraper run

**Browser Profile Setup Request**:
A request for a runner or operator to provision or validate a Browser Profile for a Source.
_Avoid_: Extraction job, profile data

**Profile Attention Item**:
A profile health problem that needs review, testing, correction, or approval.
_Avoid_: Brand task, scraper error

**Profile Extraction Status**:
The result-level summary of whether a Site Extraction Profile completed, partially filled, failed, or was skipped during extraction.
_Avoid_: Pipeline status, source outcome

## Relationships

- A **Site Extraction Profile** is owned by a brand, **Source**, and canonical source domain.
- A **Site Extraction Profile** is the preferred reusable extraction knowledge for its brand and source domain.
- A **Commerce Platform** supplies default extraction expectations, but a **Site Extraction Profile** owns the reusable site-specific knowledge.
- A **Site Extraction Profile** contains **Field Evidence Rules** for product fields such as name, description, image, specification evidence, and image role assignment.
- **Field Evidence Rules** are constrained by the owning **Source**'s allowed fields.
- **Source** trust determines cross-source authority; a **Site Extraction Profile** describes extraction evidence, not source ranking.
- Profile extraction emits **Field Evidence Provenance** for each extracted value.
- Normal source payloads persist compact **Field Evidence Provenance**; profile tests and debug artifacts may keep detailed candidate/snippet diagnostics.
- Profile extraction may be partial: fields with acceptable evidence can succeed while other fields fall back or remain missing.
- Profile extraction uses **Field Quality Gates** before accepting extracted values or falling back field-by-field.
- Repeated **Field Quality Gate** failures may recommend a **Profile Maintenance Workflow**, but they do not mutate active profile knowledge directly.
- An **Explicit Correction** may refine a **Field Evidence Rule** when it captures reusable field evidence for the same brand and source domain.
- Image **Explicit Corrections** capture both accepted and rejected evidence so image role assignment can learn what to prefer and avoid.
- Image **Explicit Corrections** may be captured wherever admins correct product images, then routed into a **Profile Maintenance Workflow** for reusable learning.
- An admin image edit is only an **Explicit Correction** when the admin deliberately marks it as reusable extractor teaching evidence.
- **Explicit Corrections** and **Profile Version** approvals record the admin actor and reason.
- Individual **Explicit Corrections** may use lightweight reason labels; activating a **Profile Version** requires a short human approval note.
- Image **Explicit Corrections** include lightweight reason labels for accepted and rejected evidence.
- A **Profile Maintenance Workflow** may show selected and rejected **Image Candidates** so admins can teach both accepted and rejected image evidence.
- Admin image edits can be marked as not reusable when they are merchandising choices rather than extractor teaching evidence.
- Image **Explicit Corrections** keep exact evidence; draft **Profile Versions** may generalize that evidence into pattern-based positive and negative **Field Evidence Rules** after AI suggestion, validation, and approval.
- High-confidence negative image **Field Evidence Rules** may hard-reject candidates before LLM image selection; ambiguous negatives should only be penalized.
- LLM image selection may arbitrate ambiguous candidates after profile rules and deterministic selection, but it must respect hard negative **Field Evidence Rules** and cannot mutate active profile knowledge.
- Image **Field Evidence Rules** operate on **Image Candidate** metadata such as URL, canonical URL, source, alt text, dimensions, DOM context, source attribute, and matched rule IDs, not only raw URLs.
- Product image selection, LLM image arbitration, image corrections, and profile tests use **Image Candidates** as their shared evidence shape.
- **Image Candidates** are built once per crawled page before profile rules, deterministic selection, and LLM image arbitration run.
- A **Site Extraction Profile** has one or more **Profile Versions** so profile changes can be reviewed, activated, or rolled back as a first-class maintenance action.
- An **Explicit Correction** creates a draft **Profile Version** before reusable extraction knowledge is activated.
- An **AI Schema Draft** may create an initial draft **Profile Version** for a new brand and source domain, but it is never active extraction knowledge until approved.
- An **AI Schema Draft** uses representative **Product Detail Pages** and must include at least one trusted seed URL; **Search Observations** may suggest additional samples but cannot be the only source.
- An **AI Schema Draft** belongs in a **Profile Maintenance Workflow**, not the normal product extraction job, and is performed as an async scraper-runner job.
- Product Detail Page seed verification, AI Schema Drafting, Profile Version validation, and Browser Profile setup/revalidation run through profile-maintenance jobs rather than product enrichment jobs.
- Profile-maintenance jobs declare required runner capabilities so only runners with suitable Crawl4AI, model, Browser Profile, or interactive-browser support can claim them.
- Profile-maintenance job artifacts are versioned durable records, not just logs or blob JSON on job rows.
- Profile-maintenance artifacts use a shared envelope for scope, provenance, status, and schema version, plus typed payloads for each artifact kind.
- Profile-maintenance artifact evidence is immutable once created; retries, corrections, or regenerated evidence create new artifact versions while review metadata may change.
- Bulky profile-maintenance evidence such as screenshots, HTML/markdown snapshots, crawl traces, and large Image Candidate dumps lives in object storage with durable references from the artifact record and is retained by default with explicit retention and purge controls.
- Profile-maintenance artifacts exclude secrets and identity state such as cookies, storage contents, auth headers, Browser Profile files, and raw token-bearing request headers.
- A normal product extraction job may create a **Profile Attention Item** when extraction quality signals show reusable profile knowledge is missing or weak.
- A **Profile Maintenance Workflow** is organized around **Profile Attention Items**, with brand, Source, and domain as context.
- **Brand Source Setup** may establish official domain evidence, trusted Product Detail Page seeds, optional Browser Profile requirements, and initial profile-maintenance inputs.
- **Brand Source Setup** can save official domain evidence without a Product Detail Page seed, but an **AI Schema Draft** requires at least one verified trusted Product Detail Page seed.
- Product Detail Page seeds are verified before they can become trusted inputs for profile drafting.
- Product Detail Page seed verification uses the same **Image Candidate** evidence pipeline as product image extraction and is performed as an async scraper-runner job rather than inside a synchronous web request.
- Verified Product Detail Page seeds become seed cases in the **Profile Validation Set** with lightweight assertions until stronger field assertions are added.
- **Profile Attention Items** guide maintenance work and do not block normal extraction unless identity, variant, UPC, or Source policy gates fail.
- **Browser Profile** problems are access or identity attention, not Site Extraction Profile failures.
- **Browser Profile** data stays in secure runner/runtime storage; coordinator records only registry metadata.
- **Browser Profiles** are provisioned through **Browser Profile Setup Requests**, not by normal product extraction jobs.
- A **Browser Profile Setup Request** is scoped to a brand, Source, and canonical source domain; Product Detail Page seeds are verification targets, not the Browser Profile owner.
- A **Browser Profile Setup Request** targets a runner or runner pool capable of interactive Browser Profile provisioning.
- A **Browser Profile** must be validated before extraction jobs can use it and periodically rechecked; validation records the verification target, runner environment, timestamp, and page evidence, while expired, revoked, or failed profiles create access or identity attention.
- **Brand Source Setup** verifies Product Detail Page seeds without a Browser Profile first, then creates a **Browser Profile Setup Request** only when access or identity blocks verification.
- **Brand Source Setup** may manually mark a Browser Profile as required; automated access-failure signals can recommend this requirement, but human confirmation is needed before it becomes required.
- Extraction jobs may reference a required **Browser Profile**, but runners resolve that reference to local secure browser-profile storage.
- If a required **Browser Profile** is stale, missing, or fails revalidation, extraction fails closed with access or identity attention instead of falling back to no-profile crawling.
- A profile-enabled extraction result reports a **Profile Extraction Status** separately from source outcome and pipeline status.
- **Profile Extraction Status** guides maintenance work and does not determine Source Outcome by itself.
- A draft **Profile Version** must be tested against a **Profile Validation Set** and explicitly approved before becoming active; partial validation failures keep it reviewable rather than discarding it.
- Only one **Profile Version** is active for a Site Extraction Profile at a time, and activation is atomic at the version level.
- A **Search Observation** may be product-specific or brand-domain-level discovery evidence, and is time-sensitive unless linked to an accepted correction or profile decision.
- **Search Observations** may pre-fill **Profile Maintenance Workflow** suggestions, but cannot alone select trusted **Product Detail Pages** for an **AI Schema Draft**.
- A **Search Observation** may inform a later **Explicit Correction**, but it is not itself a **Field Evidence Rule**.
- A **Profile Validation Set** includes corrected products, known-good URLs, nearby variants when available, assertions for fields touched by a draft **Profile Version**, and uses both fixture snapshots and live crawls before activation.
- Profile validation distinguishes rule failures from crawl/access, identity, and source mismatch failures.
- When field evidence conflicts, human-confirmed rules outrank site profile rules, structured page data, commerce platform defaults, LLM inference, and raw heuristics, in that order.
- A **Site Extraction Profile** may reference one or more opt-in **Browser Profiles** when a site requires identity or persistent preferences.
- A **Site Extraction Profile** may use a **Page Cache**, but cached page content is not itself extraction knowledge and must not substitute for executing active profile rules.
- A **Browser Profile** belongs to site access; a **Site Extraction Profile** belongs to product data extraction.

## Example dialogue

> **Dev:** "Should we cache this brand profile so Crawl4AI stops missing product images?"
> **Domain expert:** "Cache the page if freshness allows, but the reusable knowledge should go in the **Site Extraction Profile**; only use a **Browser Profile** if the site needs persistent identity or settings."

## Flagged ambiguities

- "profile" was used to mean both Crawl4AI browser identity and reusable extraction strategy — resolved: these are distinct **Browser Profile** and **Site Extraction Profile** concepts.
- Passive approval was considered as extraction learning input — resolved: only an **Explicit Correction** should refine reusable extraction knowledge.
- Serper.dev discovery output was considered as extraction profile knowledge — resolved: persist normalized **Search Observations** separately and promote only human-confirmed evidence into profile rules.
