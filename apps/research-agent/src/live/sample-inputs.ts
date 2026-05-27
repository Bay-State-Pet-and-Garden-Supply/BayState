import { z } from "zod";
import type { CandidateSourceType } from "../schemas/CandidateUrl";
import { productResearchInputSchema, type ProductResearchInput } from "../schemas/ProductResearchInput";
import { isSameOrSubdomain, normalizeDomain, normalizeUrl } from "../lib/url";
import { queryLinkedSupabase, type QueryLinkedSupabaseOptions } from "./supabase-cli";

const candidateRowSchema = z.object({
  upc: z.string().trim().min(1),
  brand_name: z.string().trim().min(1).nullable().optional(),
  product_name: z.string().trim().min(1).nullable().optional(),
  predicted_name: z.string().trim().min(1).nullable().optional(),
  official_domains: z.array(z.string()).nullable().optional(),
  preferred_domains: z.array(z.string()).nullable().optional(),
  url: z.string().trim().min(1),
  normalized_domain: z.string().trim().min(1).nullable().optional(),
  rank: z.number().nullable().optional(),
  selection_status: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
  snippet: z.string().trim().min(1).nullable().optional(),
  candidate_source: z.string().trim().min(1).nullable().optional(),
});

export type LiveCandidateRow = z.infer<typeof candidateRowSchema>;

export interface LoadLiveSampleInputsOptions extends QueryLinkedSupabaseOptions {
  limit?: number;
  upc?: string;
  brand?: string;
  samplingMode?: "candidate-baseline" | "production-shaped";
  limitPerBrand?: number;
}

export interface SampleInputWarning {
  upc?: string;
  reason: string;
}

export interface LiveSampleInputsResult {
  inputs: ProductResearchInput[];
  warnings: SampleInputWarning[];
}

const productionRowSchema = z.object({
  upc: z.string().trim().min(1),
  brand_name: z.string().trim().min(1),
  product_name: z.string().trim().min(1),
  official_domains: z.array(z.string()).nullable().optional(),
});

type ProductionLiveRow = z.infer<typeof productionRowSchema>;

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "x.com",
  "twitter.com",
];

const MARKETPLACE_DOMAINS = [
  "amazon.com",
  "ebay.com",
  "walmart.com",
  "homedepot.com",
  "business.walmart.com",
  "zoro.com",
];

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function hasDomainSuffix(candidateDomain: string, domains: string[]) {
  return domains.some((domain) => candidateDomain === domain || candidateDomain.endsWith(`.${domain}`));
}

export function classifyCandidateSourceType(
  candidateUrl: string,
  officialDomains: string[],
): CandidateSourceType {
  const normalizedDomain = normalizeDomain(candidateUrl);
  const officialDomain = officialDomains[0];

  if (normalizedDomain && officialDomain && isSameOrSubdomain(normalizedDomain, officialDomain)) {
    return "official";
  }

  if (normalizedDomain && hasDomainSuffix(normalizedDomain, SOCIAL_DOMAINS)) {
    return "serp";
  }

  if (normalizedDomain && hasDomainSuffix(normalizedDomain, MARKETPLACE_DOMAINS)) {
    return "serp";
  }

  return "distributor";
}

export function mapRowsToProductResearchInputs(rows: LiveCandidateRow[]): LiveSampleInputsResult {
  const warnings: SampleInputWarning[] = [];
  const grouped = new Map<string, LiveCandidateRow[]>();

  for (const row of rows) {
    const parsed = candidateRowSchema.parse(row);
    const current = grouped.get(parsed.upc) ?? [];
    current.push(parsed);
    grouped.set(parsed.upc, current);
  }

  const inputs: ProductResearchInput[] = [];

  for (const [upc, group] of grouped) {
    const first = group[0]!;
    const brand = first.brand_name ?? undefined;
    const registerName = first.product_name ?? first.predicted_name ?? undefined;

    if (!brand) {
      warnings.push({ upc, reason: "Skipped live sample because brand name is missing." });
      continue;
    }

    if (!registerName) {
      warnings.push({ upc, reason: "Skipped live sample because product/register name is missing." });
      continue;
    }

    const officialDomains = (first.official_domains ?? [])
      .map((domain) => normalizeDomain(domain) ?? domain)
      .filter((domain): domain is string => Boolean(domain));

    const dedupedCandidates = new Map<string, ProductResearchInput["seedCandidateUrls"][number]>();
    for (const row of group) {
      try {
        const normalizedUrl = normalizeUrl(row.url);
        if (dedupedCandidates.has(normalizedUrl)) {
          continue;
        }

        dedupedCandidates.set(normalizedUrl, {
          url: normalizedUrl,
          sourceType: classifyCandidateSourceType(normalizedUrl, officialDomains),
          ...(row.title ? { title: row.title } : {}),
          ...(row.snippet ? { snippet: row.snippet } : {}),
          ...(row.candidate_source ? { discoveredFrom: row.candidate_source } : {}),
        });
      } catch {
        warnings.push({ upc, reason: `Ignored invalid candidate URL: ${row.url}` });
      }
    }

    if (!officialDomains[0]) {
      warnings.push({ upc, reason: "Skipped live sample because the brand official domain is missing." });
      continue;
    }

    const input = productResearchInputSchema.parse({
      productId: `${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${upc}`,
      upc,
      registerName,
      brand,
      officialWebsiteUrl: `https://${officialDomains[0]}`,
      notes: "Generated from live Supabase rows. Seed URLs are retained only for deterministic comparison; production discovery should use the official domain and Serper.dev.",
      seedCandidateUrls: [...dedupedCandidates.values()],
    });

    inputs.push(input);
  }

  return { inputs, warnings };
}

export function buildLiveSampleQuery(options: LoadLiveSampleInputsOptions = {}) {
  const predicates = [
    "c.upc is not null",
    "c.url is not null",
    "c.selection_status in ('candidate', 'selected', 'extracted')",
  ];

  if (options.upc) {
    predicates.push(`c.upc = ${sqlLiteral(options.upc)}`);
  }

  if (options.brand) {
    predicates.push(`b.name ilike ${sqlLiteral(`%${options.brand}%`)}`);
  }

  const whereClause = predicates.join(" and ");
  const limit = options.limit ?? 5;

  return `with sample_upcs as (\n  select distinct c.upc\n  from official_brand_url_candidates c\n  left join brands b on b.id = c.brand_id\n  where ${whereClause}\n  order by c.upc\n  limit ${limit}\n)\nselect\n  c.upc,\n  b.name as brand_name,\n  p.name as product_name,\n  c.predicted_name,\n  b.official_domains,\n  b.preferred_domains,\n  c.url,\n  c.normalized_domain,\n  c.rank,\n  c.selection_status,\n  c.title,\n  c.snippet,\n  c.candidate_source\nfrom official_brand_url_candidates c\njoin sample_upcs s on s.upc = c.upc\nleft join brands b on b.id = c.brand_id\nleft join products p on p.upc = c.upc\norder by c.upc, coalesce(c.composite_score::numeric, 0) desc, c.rank asc`;
}

export function mapProductionRowsToProductResearchInputs(rows: ProductionLiveRow[]): LiveSampleInputsResult {
  const warnings: SampleInputWarning[] = [];
  const inputs: ProductResearchInput[] = [];

  for (const row of rows) {
    const parsed = productionRowSchema.parse(row);
    const officialDomains = (parsed.official_domains ?? [])
      .map((domain) => normalizeDomain(domain) ?? domain)
      .filter((domain): domain is string => Boolean(domain));

    if (!officialDomains[0]) {
      warnings.push({ upc: parsed.upc, reason: "Skipped production-shaped live sample because the brand official domain is missing." });
      continue;
    }

    inputs.push(productResearchInputSchema.parse({
      productId: `${parsed.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${parsed.upc}`,
      upc: parsed.upc,
      registerName: parsed.product_name,
      brand: parsed.brand_name,
      officialWebsiteUrl: `https://${officialDomains[0]}`,
      notes: "Generated from live linked Supabase product/brand rows without pre-seeded candidate URLs.",
      seedCandidateUrls: [],
    }));
  }

  return { inputs, warnings };
}

export function buildProductionLiveSampleQuery(options: LoadLiveSampleInputsOptions = {}) {
  const predicates = [
    "p.upc is not null",
    "coalesce(p.name, p.short_name) is not null",
    "array_length(b.official_domains, 1) > 0",
  ];

  if (options.upc) {
    predicates.push(`p.upc = ${sqlLiteral(options.upc)}`);
  }

  if (options.brand) {
    predicates.push(`b.name ilike ${sqlLiteral(`%${options.brand}%`)}`);
  }

  const whereClause = predicates.join(" and ");
  const limit = options.limit ?? 10;
  const limitPerBrand = options.limitPerBrand ?? 2;

  return `with ranked_products as (\n  select\n    p.upc,\n    b.name as brand_name,\n    coalesce(p.name, p.short_name) as product_name,\n    b.official_domains,\n    row_number() over (partition by b.id order by md5(coalesce(p.upc, ''))) as brand_rank\n  from products p\n  join brands b on b.id = p.brand_id\n  where ${whereClause}\n)\nselect\n  upc,\n  brand_name,\n  product_name,\n  official_domains\nfrom ranked_products\nwhere brand_rank <= ${limitPerBrand}\norder by brand_name, upc\nlimit ${limit}`;
}

export async function loadLiveSampleInputs(
  options: LoadLiveSampleInputsOptions = {},
): Promise<LiveSampleInputsResult> {
  if (options.samplingMode === "production-shaped") {
    const rows = await queryLinkedSupabase(buildProductionLiveSampleQuery(options), options);
    return mapProductionRowsToProductResearchInputs(rows as ProductionLiveRow[]);
  }

  const rows = await queryLinkedSupabase(buildLiveSampleQuery(options), options);
  return mapRowsToProductResearchInputs(rows as LiveCandidateRow[]);
}
