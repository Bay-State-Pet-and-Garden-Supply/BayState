# Research: Cloudflare R2 vs Supabase Storage for Login-Protected Distributor Images

## Summary
**Cloudflare R2 is the better long-term target** for durable copies of scraper-captured distributor images when delivery costs or scale are a concern. R2 eliminates egress fees entirely ($0/GB vs $0.03–$0.09/GB over Supabase's included quota), offers S3-compatible APIs for direct scraper uploads and server-signed URLs, and provides CDN delivery through Cloudflare's global network. **Keep Supabase Storage for user-scoped files** where Postgres RLS integration adds value, but for high-read-volume distributor images that are served broadly to authorized users, R2 is cheaper, more portable, and operationally simpler at scale.

---

## Findings

1. **R2 egress is free; Supabase Storage egress costs $0.03–$0.09/GB after quota** — Cloudflare R2 charges $0/GB for data transfer to the internet, across all storage classes. [Source: R2 Pricing](https://developers.cloudflare.com/r2/pricing/). Supabase Pro includes 250 GB cached egress + 250 GB uncached egress; overage is $0.03/GB cached and $0.09/GB uncached. [Source: Supabase Pricing](https://supabase.com/pricing). For a distributor-image workload where the same images are fetched repeatedly (product photos, catalogs, spec sheets), this difference compounds rapidly. A storefront serving 1 TB of images/month would pay **$0 on R2** vs **$30–$90 on Supabase** in egress alone after the included quota.

2. **R2 storage is cheaper at scale** — R2 Standard storage: $0.015/GB-month, with 10 GB free. Supabase Storage: $0.0213/GB-month after the included 100 GB on Pro ($25/month). [Source: R2 Pricing](https://developers.cloudflare.com/r2/pricing/) | [Source: Supabase Storage Pricing](https://supabase.com/docs/guides/storage/pricing). For a library of 500 GB of distributor images, that is **$7.50/month on R2** vs **$8.52/month on Supabase** (plus $25/month Pro plan minimum) — and the gap widens with scale.

3. **R2 speaks the S3 API — scraper can use AWS SDK directly** — R2 implements the S3 API (with some gaps). The scraper (Python, Playwright/crawl4ai) can upload using `boto3` by changing only the endpoint URL. [Source: S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/). The web app (Next.js) generates presigned URLs via `@aws-sdk/s3-request-presigner` for time-limited delivery. [Source: Presigned URLs docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/). This means **no vendor-specific SDK** — the same code works with S3, R2, or any S3-compatible provider.

4. **R2 offers multiple delivery/auth patterns for protected images** — (a) **Presigned URLs**: time-limited GET URLs generated server-side, ideal for per-user or per-session access; max 7-day expiry. (b) **Public bucket + custom domain + Cloudflare CDN**: serve images directly via `images.yourdomain.com` with full CDN caching; add Cloudflare Access (SSO) or WAF Token Authentication for access control. (c) **Workers proxy**: a Cloudflare Worker sits between client and R2, enforcing custom auth logic. [Source: Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) | [Source: Protect with Cloudflare Access](https://developers.cloudflare.com/r2/tutorials/cloudflare-access/). Supabase Storage's delivery is essentially signed URLs (per-request or pre-generated) or public buckets — fewer options, and signed URLs have a cache-key-per-token problem.

5. **Supabase Storage signed URLs have a fundamental cache-efficiency problem** — With Smart CDN enabled, each unique signed URL token creates its own CDN cache entry. Generating a new signed URL on every request guarantees a cache miss. [Source: Supabase Smart CDN docs](https://supabase.com/docs/guides/storage/cdn/smart-cdn). For distributor images served to many users (even authenticated ones), this means the CDN is largely ineffective unless you reuse the exact same signed URL across requests — which undercuts security. R2 avoids this: public bucket + custom domain is cacheable by design, and presigned URLs pass through Cloudflare's cache with standard cache-key behavior.

6. **Supabase Storage RLS is powerful but overkill for distributor images** — Supabase's row-level security on storage objects is valuable when each file is tenant-scoped and the auth policy is "user X can see their own files." For distributor images, the access pattern is typically "any authenticated or authorized user can see any distributor image" — a flat authorization model that doesn't benefit from per-object RLS. The integration convenience is real but the access logic is simple enough to implement with a middleware check or session gate regardless of storage backend. [Source: Supabase Storage serving](https://supabase.com/docs/guides/storage/serving/downloads).

7. **R2 has mature migration tooling** — Cloudflare's **Super Slurper** (GA) copies objects from any S3-compatible source to R2 without egress fees. **Sippy** provides on-demand migration (copy-on-read). `rclone` with S3 backends also works. [Source: Migration Strategies](https://developers.cloudflare.com/r2/data-migration/migration-strategies/) | [Source: Super Slurper GA](https://blog.cloudflare.com/r2-super-slurper-ga/). A migration from Supabase Storage to R2 is a one-time copy operation. Dual-write during transition is straightforward since both speak S3-compatible APIs.

8. **Key R2 limitations to know** — (a) Presigned URL max expiry is **7 days** (AWS S3 allows configurable). [Source: Presigned URLs docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/). (b) No `POST` policy support (HTML form uploads) — use signed `PUT` URLs instead. (c) No Glacier-equivalent cold storage tier (Infrequent Access is the coldest, $0.01/GB-month + retrieval fees). (d) No multi-region buckets in the AWS sense — R2 is automatically distributed across Cloudflare's network but with a single "auto" region endpoint. [Source: S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/). (e) S3 Object Lambda, Batch Operations, and per-object ACLs are absent.

9. **Supabase Storage is _not_ a general-purpose object store at scale** — The comparison article from Adam Arant (June 2026) puts it plainly: "Avoid Supabase Storage as a general-purpose object store." Its strength is tight auth integration for small, user-scoped files. The recommended pattern is **Supabase Storage for user-private files + R2 for everything served broadly**, even when the broader audience is authenticated. [Source: R2 vs S3 vs Supabase Storage 2026](https://adamarant.com/en/blog/cloudflare-r2-vs-s3-vs-supabase-storage-in-2026-which-to-pick).

10. **Scraper integration pattern** — A clean architecture: scraper (Python) uses `boto3` with R2 credentials to `PutObject` captured images into an R2 bucket. Web app (Next.js) uses `@aws-sdk/client-s3` to list and generate presigned GET URLs for delivery. No vendor credentials flow through the browser — the presigned URL is the only token exposed. If images are not per-user restricted, use an R2 public bucket behind a custom domain with Cloudflare's CDN and WAF Token Authentication. This keeps the scraper stateless (it just writes to S3) and decouples storage from the Supabase auth layer.

---

## Sources

### Kept
- **Cloudflare R2 Presigned URLs** (https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — Primary docs on generating time-limited access URLs; core to the recommendation.
- **Cloudflare R2 Public Buckets** (https://developers.cloudflare.com/r2/buckets/public-buckets/) — Covers custom domain + CDN delivery, the alternative to per-URL signing.
- **Cloudflare R2 S3 API Compatibility** (https://developers.cloudflare.com/r2/api/s3/api/) — Exact gap list; critical for migration assessment.
- **Cloudflare R2 Pricing** (https://developers.cloudflare.com/r2/pricing/) — Official pricing page with free tier, storage, and ops costs.
- **Cloudflare R2 Protect with Cloudflare Access** (https://developers.cloudflare.com/r2/tutorials/cloudflare-access/) — Shows SSO-gated auth for R2 buckets.
- **Supabase Storage Smart CDN** (https://supabase.com/docs/guides/storage/cdn/smart-cdn) — Explains the signed URL cache-key-per-token issue; key argument against Supabase for high-read workloads.
- **Supabase Storage Pricing** (https://supabase.com/docs/guides/storage/pricing) — Official storage pricing per GB-month.
- **Supabase Pricing & Fees** (https://supabase.com/pricing) — Shows egress overage costs ($0.03–$0.09/GB) and included quotas.
- **Supabase Storage Serving Assets** (https://supabase.com/docs/guides/storage/serving/downloads) — Docs on signed URLs and authenticated access patterns.
- **Supabase Manage Egress Usage** (https://supabase.com/docs/guides/platform/manage-your-usage/egress) — Details on cached vs uncached egress billing.
- **R2 vs S3 vs Supabase Storage 2026** (https://adamarant.com/en/blog/cloudflare-r2-vs-s3-vs-supabase-storage-in-2026-which-to-pick) — Direct comparison with TL;DR recommendation matching our findings.
- **Cloudflare R2 Migration Strategies** (https://developers.cloudflare.com/r2/data-migration/migration-strategies/) — Super Slurper and Sippy documentation.
- **R2 Super Slurper GA** (https://blog.cloudflare.com/r2-super-slurper-ga/) — Announcement and capabilities.
- **Next.js + R2 Presigned URLs Guide** (https://samioda.com/en/blog/nextjs-file-uploads-s3-r2-presigned-url-guide) — Production-ready pattern for Next.js App Router with validation and security.
- **Supabase Storage Multi-Tenant RLS Leak Modes** (https://securestartkit.com/blog/supabase-storage-multi-tenant-rls-2026) — Documents cross-tenant signed URL leak risk.

### Dropped
- **Medium migration story** — Anecdotal; confirms cost savings but no technical depth beyond what official docs cover.
- **DEV Community tutorial** — Functional but redundant with official docs; no new architectural insight.
- **Transloadit demo** — Vendor-specific migration service; not relevant for a DIY migration assessment.
- **BuildMVPFast comparison pages** — Marketing-oriented summaries with less precision than the Adam Arant article.

---

## Gaps
- **No direct Supabase-Auth-to-R2 integration exists** — the bridge between Supabase session tokens and R2 presigned URL generation must be custom code in Next.js API routes or Server Actions. This is straightforward (a few lines per endpoint) but is additional surface area compared to Supabase Storage's built-in auth checks.
- **No cached egress pricing tier for R2** — Cloudflare Cache sits in front of R2 buckets on custom domains, but R2 itself has no concept of "cached vs uncached" billing; all egress is free. The gap is that R2 does not offer its own image transformation service (Cloudflare Image Resizing is a separate product). If inline image resizing is needed, add Cloudflare Image Resizing or a Worker-based transform.
- **Latency from scraper writes** — R2 is regionless ("auto" endpoint). While read latency is excellent (Cloudflare's global network), write latency from a scraper in a specific region may be higher than a region-pinned Supabase Storage endpoint. Benchmarks for multi-region write performance are not published by Cloudflare.
- **Scaled pricing at very high request volumes** — R2 charges $0.36/million Class B reads. At 100M+ reads/month, this cost adds up. Supabase Storage counts reads as DB requests (different billing model). For extremely high-traffic images, a dedicated CDN analysis is warranted.
- **Supabase Storage smart CDN invalidation delay** — up to 60 seconds for cache invalidation on object deletion/update. R2 cache invalidation behavior via Cloudflare's CDN may differ (standard Cloudflare cache purge). This matters for frequently-updated distributor images.

**Suggested next steps if moving forward:**
1. Benchmark a scraper → R2 upload flow with a sample batch of images (~1000) to measure write latency and verify S3 API compatibility with boto3.
2. Prototype presigned URL generation in Next.js with `@aws-sdk/s3-request-presigner` targeting R2 endpoint.
3. Evaluate whether distributor images need per-user access restrictions or just session-gated access — this determines whether to use presigned URLs (per-session) or a public bucket with Cloudflare Access (SSO).
4. If migrating from existing Supabase Storage: run a dry migration using `rclone` copy to measure time and cost, then plan dual-write period.
5. Consider Cloudflare Image Resizing if on-the-fly thumbnail generation is needed for storefront image grids.

---

## Supervisor coordination
No coordination needed. This research brief is self-contained.
