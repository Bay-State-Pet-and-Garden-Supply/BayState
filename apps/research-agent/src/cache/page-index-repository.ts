import type { PageIndexDb } from "./page-index-db";
import { normalizeUrl, normalizeDomain } from "../lib/url";
import { normalizeBarcode, normalizeBarcodes } from "../lib/barcode";
import type {
  IndexedDomain,
  DiscoveredDomainUrl,
  PageIndexStats,
  UpsertDomainInput,
  UpsertPageFactsInput,
  IndexedPageCandidate,
} from "./page-index-schema";

export class PageIndexRepository {
  constructor(private readonly db: PageIndexDb) {}

  async upsertDomain(input: UpsertDomainInput): Promise<IndexedDomain> {
    const now = new Date().toISOString();
    const dbInstance = this.db.db;

    const row = dbInstance.prepare("SELECT * FROM domains WHERE normalized_domain = ?").get(input.normalizedDomain) as any;

    if (row) {
      dbInstance.prepare(`
        UPDATE domains 
        SET official_website_url = COALESCE(?, official_website_url),
            brand_name = COALESCE(?, brand_name),
            updated_at = ?
        WHERE id = ?
      `).run(input.officialWebsiteUrl ?? null, input.brandName ?? null, now, row.id);

      return {
        id: row.id,
        normalizedDomain: row.normalized_domain,
        officialWebsiteUrl: input.officialWebsiteUrl ?? row.official_website_url,
        brandName: input.brandName ?? row.brand_name,
        createdAt: row.created_at,
        updatedAt: now,
        lastSitemapCheckedAt: row.last_sitemap_checked_at ?? undefined,
        lastCrawlStartedAt: row.last_crawl_started_at ?? undefined,
        lastCrawlCompletedAt: row.last_crawl_completed_at ?? undefined,
      };
    } else {
      const result = dbInstance.prepare(`
        INSERT INTO domains (normalized_domain, official_website_url, brand_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.normalizedDomain, input.officialWebsiteUrl ?? null, input.brandName ?? null, now, now);

      return {
        id: result.lastInsertRowid as number,
        normalizedDomain: input.normalizedDomain,
        officialWebsiteUrl: input.officialWebsiteUrl,
        brandName: input.brandName,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  async updateDomainSitemapCheckedAt(domain: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.db.prepare("UPDATE domains SET last_sitemap_checked_at = ?, updated_at = ? WHERE normalized_domain = ?").run(now, now, domain);
  }

  async updateDomainCrawlStartedAt(domain: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.db.prepare("UPDATE domains SET last_crawl_started_at = ?, updated_at = ? WHERE normalized_domain = ?").run(now, now, domain);
  }

  async updateDomainCrawlCompletedAt(domain: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.db.prepare("UPDATE domains SET last_crawl_completed_at = ?, updated_at = ? WHERE normalized_domain = ?").run(now, now, domain);
  }

  async getDomain(domain: string): Promise<IndexedDomain | null> {
    const row = this.db.db.prepare("SELECT * FROM domains WHERE normalized_domain = ?").get(domain) as any;
    if (!row) return null;
    return {
      id: row.id,
      normalizedDomain: row.normalized_domain,
      officialWebsiteUrl: row.official_website_url ?? undefined,
      brandName: row.brand_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSitemapCheckedAt: row.last_sitemap_checked_at ?? undefined,
      lastCrawlStartedAt: row.last_crawl_started_at ?? undefined,
      lastCrawlCompletedAt: row.last_crawl_completed_at ?? undefined,
    };
  }

  async upsertDiscoveredUrls(domain: string, urls: DiscoveredDomainUrl[]): Promise<void> {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) return;

    let domainRow = this.db.db.prepare("SELECT id FROM domains WHERE normalized_domain = ?").get(normalizedDomain) as any;
    if (!domainRow) {
      domainRow = await this.upsertDomain({ normalizedDomain });
    }

    const domainId = domainRow.id;
    const now = new Date().toISOString();

    const insertStmt = this.db.db.prepare(`
      INSERT INTO domain_urls (domain_id, url, normalized_url, url_type, discovered_from, first_seen_at, last_seen_at, is_product_like)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_url) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        is_product_like = CASE WHEN excluded.is_product_like = 1 THEN 1 ELSE domain_urls.is_product_like END
    `);

    const insertTx = this.db.db.transaction((urlsList: DiscoveredDomainUrl[]) => {
      for (const item of urlsList) {
        try {
          const normUrl = normalizeUrl(item.url);
          insertStmt.run(
            domainId,
            item.url,
            normUrl,
            item.urlType ?? "unknown",
            item.discoveredFrom ?? null,
            now,
            now,
            item.isProductLike ? 1 : 0
          );
        } catch {
          // Ignore malformed URL insertions
        }
      }
    });

    insertTx(urls);
  }

  async markFetchResult(
    url: string,
    result: {
      status: number;
      error?: string;
      contentHash?: string;
      title?: string;
      description?: string;
      textExcerpt?: string;
      isProductLike?: boolean;
    }
  ): Promise<void> {
    const normUrl = normalizeUrl(url);
    const now = new Date().toISOString();

    this.db.db.prepare(`
      UPDATE domain_urls
      SET last_fetched_at = ?,
          fetch_status = ?,
          fetch_error = ?,
          content_hash = ?,
          title = ?,
          description = ?,
          text_excerpt = ?,
          is_product_like = CASE WHEN ? = 1 THEN 1 ELSE is_product_like END,
          index_status = ?
      WHERE normalized_url = ?
    `).run(
      now,
      result.status,
      result.error ?? null,
      result.contentHash ?? null,
      result.title ?? null,
      result.description ?? null,
      result.textExcerpt ?? null,
      result.isProductLike ? 1 : 0,
      result.status >= 200 && result.status < 300 ? "fetched" : "failed",
      normUrl
    );
  }

  async upsertPageFacts(input: UpsertPageFactsInput): Promise<void> {
    const normUrl = normalizeUrl(input.url);
    const normDomain = normalizeDomain(normUrl);
    if (!normDomain) return;

    let urlRow = this.db.db.prepare("SELECT id FROM domain_urls WHERE normalized_url = ?").get(normUrl) as any;
    if (!urlRow) {
      await this.upsertDiscoveredUrls(normDomain, [{
        url: input.url,
        isProductLike: true,
        discoveredFrom: "direct-upsert-facts",
      }]);
      urlRow = this.db.db.prepare("SELECT id FROM domain_urls WHERE normalized_url = ?").get(normUrl) as any;
    }

    const urlId = urlRow.id;
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(input.images ?? []);
    const categoriesJson = JSON.stringify(input.categories ?? []);
    const attributesJson = JSON.stringify(input.attributes ?? {});
    const upcsJson = JSON.stringify(normalizeBarcodes(input.upcs ?? []));
    const evidenceJson = JSON.stringify(input.evidence ?? []);
    const jsonldJson = JSON.stringify(input.jsonld ?? []);

    this.db.db.prepare(`
      INSERT INTO page_facts (domain_url_id, source_url, title, description, images_json, categories_json, attributes_json, upcs_json, brand, confidence, evidence_json, jsonld_json, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        images_json = excluded.images_json,
        categories_json = excluded.categories_json,
        attributes_json = excluded.attributes_json,
        upcs_json = excluded.upcs_json,
        brand = excluded.brand,
        confidence = excluded.confidence,
        evidence_json = excluded.evidence_json,
        jsonld_json = excluded.jsonld_json,
        extracted_at = excluded.extracted_at
    `).run(
      urlId,
      input.url,
      input.title ?? null,
      input.description ?? null,
      imagesJson,
      categoriesJson,
      attributesJson,
      upcsJson,
      input.brand ?? null,
      input.confidence ?? 0,
      evidenceJson,
      jsonldJson,
      now
    );

    const factRow = this.db.db.prepare("SELECT id FROM page_facts WHERE source_url = ?").get(input.url) as any;
    if (factRow) {
      const bodyText = [
        input.description ?? "",
        ...(input.evidence ?? []),
        JSON.stringify(input.categories ?? []),
      ].join(" ");

      this.db.db.prepare(`
        INSERT OR REPLACE INTO page_fts (rowid, normalized_url, normalized_domain, title, description, body, attributes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        factRow.id,
        normUrl,
        normDomain,
        input.title ?? "",
        input.description ?? "",
        bodyText,
        attributesJson
      );

      this.db.db.prepare("UPDATE domain_urls SET index_status = 'indexed' WHERE id = ?").run(urlId);
    }
  }

  async searchByUpc(input: { upc: string; domain?: string }): Promise<IndexedPageCandidate[]> {
    const normalizedDomain = input.domain ? normalizeDomain(input.domain) : undefined;
    const normalizedUpc = normalizeBarcode(input.upc);
    if (!normalizedUpc) return [];

    let query = `
      SELECT pf.*, du.is_product_like, du.discovered_from
      FROM page_facts pf
      JOIN domain_urls du ON pf.domain_url_id = du.id
      JOIN domains d ON du.domain_id = d.id
      WHERE EXISTS (
        SELECT 1 FROM json_each(pf.upcs_json) WHERE value = ?
      )
    `;

    const params: any[] = [normalizedUpc];

    if (normalizedDomain) {
      query += " AND d.normalized_domain = ?";
      params.push(normalizedDomain);
    }

    const rows = this.db.db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      url: row.source_url,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      snippet: row.description ?? undefined,
      isProductLike: row.is_product_like === 1,
      discoveredFrom: row.discovered_from ?? undefined,
      confidence: row.confidence,
      upcs: JSON.parse(row.upcs_json),
    }));
  }

  async searchByText(input: { text: string; domain?: string }): Promise<IndexedPageCandidate[]> {
    const normalizedDomain = input.domain ? normalizeDomain(input.domain) : undefined;
    
    // Split into tokens for matching
    const cleanText = input.text.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const tokens = cleanText.split(/\s+/).filter((t) => t.length > 1).map((t) => `${t}*`).join(" AND ");
    if (!tokens) return [];

    let query = `
      SELECT pf.*, du.is_product_like, du.discovered_from, fts.rank
      FROM page_fts fts
      JOIN page_facts pf ON fts.rowid = pf.id
      JOIN domain_urls du ON pf.domain_url_id = du.id
      JOIN domains d ON du.domain_id = d.id
      WHERE page_fts MATCH ?
    `;

    const params: any[] = [tokens];

    if (normalizedDomain) {
      query += " AND d.normalized_domain = ?";
      params.push(normalizedDomain);
    }

    query += " ORDER BY fts.rank LIMIT 20";

    const rows = this.db.db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      url: row.source_url,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      snippet: row.description ?? undefined,
      isProductLike: row.is_product_like === 1,
      discoveredFrom: row.discovered_from ?? undefined,
      confidence: row.confidence,
      upcs: JSON.parse(row.upcs_json),
    }));
  }

  async getStaleProductLikeUrls(
    domain: string,
    options: { limit?: number; ttlDays?: number } = {}
  ): Promise<string[]> {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) return [];

    const limit = options.limit ?? 50;
    const ttlDays = options.ttlDays ?? 7;

    const query = `
      SELECT du.url
      FROM domain_urls du
      JOIN domains d ON du.domain_id = d.id
      WHERE d.normalized_domain = ?
        AND du.is_product_like = 1
        AND (du.last_fetched_at IS NULL OR datetime(du.last_fetched_at) < datetime('now', '-' || ? || ' days'))
      ORDER BY du.last_fetched_at IS NOT NULL, datetime(du.last_fetched_at) ASC, du.first_seen_at ASC
      LIMIT ?
    `;

    const rows = this.db.db.prepare(query).all(normalizedDomain, ttlDays, limit) as any[];
    return rows.map((row) => row.url);
  }

  async getStats(): Promise<PageIndexStats> {
    const dbInstance = this.db.db;

    const domainCount = (dbInstance.prepare("SELECT count(*) as c FROM domains").get() as any).c;
    const urlCount = (dbInstance.prepare("SELECT count(*) as c FROM domain_urls").get() as any).c;
    const fetchedUrlCount = (dbInstance.prepare("SELECT count(*) as c FROM domain_urls WHERE last_fetched_at IS NOT NULL").get() as any).c;
    const productLikeUrlCount = (dbInstance.prepare("SELECT count(*) as c FROM domain_urls WHERE is_product_like = 1").get() as any).c;
    const pageFactsCount = (dbInstance.prepare("SELECT count(*) as c FROM page_facts").get() as any).c;

    return {
      domainCount,
      urlCount,
      fetchedUrlCount,
      productLikeUrlCount,
      pageFactsCount,
    };
  }

  async pruneOldRecords(olderThanDays: number): Promise<void> {
    this.db.db.prepare(`
      DELETE FROM domain_urls
      WHERE last_fetched_at IS NOT NULL
        AND datetime(last_fetched_at) < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays);
  }
}
