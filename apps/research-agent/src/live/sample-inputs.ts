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
}

export interface SampleInputWarning {
  upc?: string;
  reason: string;
}

export interface LiveSampleInputsResult {
  inputs: ProductResearchInput[];
  warnings: SampleInputWarning[];
}

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

function inferExpectedAttributes(...values: Array<string | undefined>) {
  const combined = values.filter(Boolean).join(" ");
  const sizeMatch = combined.match(/\b(\d+(?:\.\d+)?)\s?(oz|lb|lbs|g|kg)\b/i);
  return {
    ...(sizeMatch ? { size: `${sizeMatch[1]} ${sizeMatch[2].toLowerCase()}` } : {}),
  };
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

    const dedupedCandidates = new Map<string, ProductResearchInput["candidateUrls"][number]>();
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

    if (dedupedCandidates.size === 0) {
      warnings.push({ upc, reason: "Skipped live sample because no valid candidate URLs were available." });
      continue;
    }

    const input = productResearchInputSchema.parse({
      productId: `${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${upc}`,
      upc,
      registerName,
      brand,
      ...(officialDomains[0] ? { officialWebsiteUrl: `https://${officialDomains[0]}` } : {}),
      expectedAttributes: inferExpectedAttributes(registerName, first.predicted_name ?? undefined),
      notes: "Generated from live Supabase official_brand_url_candidates rows via Supabase CLI.",
      candidateUrls: [...dedupedCandidates.values()],
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

export async function loadLiveSampleInputs(
  options: LoadLiveSampleInputsOptions = {},
): Promise<LiveSampleInputsResult> {
  const rows = await queryLinkedSupabase(buildLiveSampleQuery(options), options);
  return mapRowsToProductResearchInputs(rows as LiveCandidateRow[]);
}
