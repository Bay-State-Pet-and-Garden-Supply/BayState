import { Database } from "bun:sqlite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { getResearchAgentPaths } from "../pi/paths";

export class PageIndexDb {
  public readonly db: Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? process.env.RESEARCH_AGENT_CACHE_DB ?? this.getDefaultDbPath();
    
    if (resolvedPath !== ":memory:") {
      const parentDir = path.dirname(resolvedPath);
      mkdirSync(parentDir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.init();
  }

  private getDefaultDbPath(): string {
    const appRoot = getResearchAgentPaths().appRoot;
    return path.resolve(appRoot, ".cache", "research-agent", "page-index.sqlite");
  }

  private init() {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");

    // Create tables
    this.db.exec(`
      create table if not exists domains (
        id integer primary key autoincrement,
        normalized_domain text not null unique,
        official_website_url text,
        brand_name text,
        created_at text not null,
        updated_at text not null,
        last_sitemap_checked_at text,
        last_crawl_started_at text,
        last_crawl_completed_at text
      );

      create table if not exists domain_urls (
        id integer primary key autoincrement,
        domain_id integer not null references domains(id) on delete cascade,
        url text not null unique,
        normalized_url text not null unique,
        url_type text not null default 'unknown',
        discovered_from text,
        first_seen_at text not null,
        last_seen_at text not null,
        last_fetched_at text,
        fetch_status integer,
        fetch_error text,
        content_hash text,
        title text,
        description text,
        text_excerpt text,
        is_product_like integer not null default 0,
        index_status text not null default 'pending'
      );

      create index if not exists idx_domain_urls_domain_id on domain_urls(domain_id);
      create index if not exists idx_domain_urls_product_like on domain_urls(domain_id, is_product_like);

      create table if not exists page_facts (
        id integer primary key autoincrement,
        domain_url_id integer not null references domain_urls(id) on delete cascade,
        source_url text not null unique,
        title text,
        description text,
        images_json text not null default '[]',
        categories_json text not null default '[]',
        attributes_json text not null default '{}',
        upcs_json text not null default '[]',
        brand text,
        confidence real not null default 0,
        evidence_json text not null default '[]',
        jsonld_json text not null default '[]',
        extracted_at text not null
      );

      create index if not exists idx_page_facts_domain_url_id on page_facts(domain_url_id);

      create virtual table if not exists page_fts using fts5(
        normalized_url unindexed,
        normalized_domain unindexed,
        title,
        description,
        body,
        attributes,
        tokenize = 'porter unicode61'
      );
    `);
  }

  close() {
    this.db.close();
  }
}
