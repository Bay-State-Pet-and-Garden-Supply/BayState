import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getAIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';
import type { AIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';
import {
  buildDiscoveryOfficialBrandCandidateRows,
  persistOfficialBrandCandidateRows,
  normalizeOfficialBrandDomain,
} from '@/lib/official-brand-workflow';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Standard aggregator/retailer sites to exclude from search results. */
const SITE_EXCLUSIONS = [
  'amazon.com',
  'ebay.com',
  'walmart.com',
  'target.com',
  'chewy.com',
  'petco.com',
  'petsmart.com',
  'homedepot.com',
  'lowes.com',
  'tractorsupply.com',
];

const AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH = 5;
const CROSS_PHASE_BONUS = 10;
const SKU_IN_CONTENT_BONUS = 5;
const PREDICTED_NAME_OVERLAP_BONUS = 3;
const KNOWLEDGE_GRAPH_BONUS = 40;
const MAX_SCORED_CANDIDATES = 5;

/**
 * Returns true when an identifier-only query is likely too generic
 * to stand on its own (e.g. short all-numeric values that could be
 * UPC fragments rather than unique SKUs).
 */
function isAmbiguousIdentifier(sku: string): boolean {
  const cleaned = sku.trim();
  if (!cleaned) return false;
  return /^\d+$/.test(cleaned) && cleaned.length < AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH;
}

/** Phase 1 search query: SKU-only for strong identifiers, brand+SKU for ambiguous ones. */
function buildPhase1Query(sku: string, brandName?: string): string {
  const skuClean = sku.trim();
  if (!skuClean) return '';
  if (brandName && isAmbiguousIdentifier(skuClean)) {
    return `${brandName.trim()} ${skuClean}`;
  }
  return skuClean;
}

/** Phase 2 search query: consolidated product name + brand. */
function buildPhase2Query(predictedName: string, brandName?: string): string {
  const parts = [predictedName.trim(), brandName?.trim()].filter(Boolean);
  return parts.join(' ');
}

/** Append -site: exclusion directives to a base query string. */
function buildExclusionQuery(baseQuery: string): string {
  const clean = baseQuery.trim();
  if (!clean) return '';
  const exclusions = SITE_EXCLUSIONS.map((d) => `-site:${d}`).join(' ');
  return `${clean} ${exclusions}`;
}

/**
 * Build site-constrained rescue queries for known official/preferred domains.
 * Returns `["site:domain1 query", "site:domain2 query", ...]`.
 */
function buildSiteConstrainedQueries(domains: string[], query: string): string[] {
  const cleanQuery = query.trim();
  if (!cleanQuery || domains.length === 0) return [];
  return domains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean)
    .map((normalized) => `site:${normalized} ${cleanQuery}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SerperCandidate {
  url: string;
  title: string;
  snippet: string;
  result_type: 'organic' | 'knowledge_graph';
}

/** Phase-merge intermediate: SerperCandidate tagged with which phases it appeared in. */
interface MergedCandidate extends SerperCandidate {
  appeared_in_phases: number[];
}

interface ScoredCandidate extends SerperCandidate {
  rank: number;
  confidence: number;
  selection_tier: 'official_domain' | 'preferred_domain' | 'knowledge_graph' | 'organic';
  composite_score: number;
  appeared_in_phases: number[];
}

interface SkuResult {
  official_brand: {
    selected_url: string;
    url: string;
    candidates: ScoredCandidate[];
    confidence: number;
    predicted_name: string | null;
    status: 'found' | 'not_found';
    phase1_result_count: number;
    phase2_result_count: number;
  };
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

async function withConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Serper search (shared)
// ---------------------------------------------------------------------------

/**
 * Execute a single Serper search query.
 * The `query` parameter accepts any string — callers compose the desired
 * query strategy (SKU-only, brand+name, excluded, site-constrained, etc.)
 * before passing it here.
 */
async function serperSearch(query: string, serperApiKey: string): Promise<SerperCandidate[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num: 10,
          autocorrect: false,
          gl: 'us',
          hl: 'en',
        }),
      });

      if (!response.ok) {
        throw new Error(`Serper API returned ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        organic?: Array<{ link?: string; title?: string; snippet?: string; position?: number }>;
        knowledgeGraph?: { website?: string; title?: string; description?: string };
      };

      const candidates: SerperCandidate[] = [];

      if (Array.isArray(data.organic)) {
        for (const result of data.organic) {
          if (result.link) {
            candidates.push({
              url: result.link,
              title: result.title ?? '',
              snippet: result.snippet ?? '',
              result_type: 'organic',
            });
          }
        }
      }

      if (data.knowledgeGraph?.website) {
        candidates.push({
          url: data.knowledgeGraph.website,
          title: data.knowledgeGraph.title ?? '',
          snippet: data.knowledgeGraph.description ?? '',
          result_type: 'knowledge_graph',
        });
      }

      return candidates;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Phase 2 search: runs the main excluded query plus optional site-constrained
 * queries for known domains. Merges and deduplicates results by URL.
 */
async function serperSearchPhase2(
  mainQuery: string,
  serperApiKey: string,
  officialDomains?: string[],
  preferredDomains?: string[],
): Promise<SerperCandidate[]> {
  const merged: SerperCandidate[] = [];
  const seen = new Set<string>();

  const allDomains = [
    ...(officialDomains ?? []),
    ...(preferredDomains ?? []),
  ];

  // Build candidate queries: main query + site-constrained variants
  const queries = [mainQuery];
  if (allDomains.length > 0) {
    const constrained = buildSiteConstrainedQueries(allDomains, mainQuery);
    queries.push(...constrained);
  }

  for (const q of queries) {
    if (!q.trim()) continue;
    try {
      const results = await serperSearch(q, serperApiKey);
      for (const r of results) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          merged.push(r);
        }
      }
    } catch {
      // Phase 2 is non-fatal per-query — skip failures silently
      continue;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Merging & deduplication
// ---------------------------------------------------------------------------

/**
 * Merge Phase 1 and Phase 2 search results, tagging each URL with the
 * phases it appeared in. Deduplicates by URL, keeping the result with
 * the most phases (ties → keep first occurrence).
 */
function mergeAndDedupeCandidates(
  phase1: SerperCandidate[],
  phase2: SerperCandidate[],
): MergedCandidate[] {
  const byUrl = new Map<string, MergedCandidate>();

  for (const c of phase1) {
    byUrl.set(c.url, { ...c, appeared_in_phases: [1] });
  }

  for (const c of phase2) {
    const existing = byUrl.get(c.url);
    if (existing) {
      existing.appeared_in_phases = [1, 2];
    } else {
      byUrl.set(c.url, { ...c, appeared_in_phases: [2] });
    }
  }

  return Array.from(byUrl.values());
}

// ---------------------------------------------------------------------------
// LLM-powered name consolidation
// ---------------------------------------------------------------------------

async function consolidateName(
  openai: OpenAI,
  productName: string,
  brandName: string,
  titles: string[],
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Extract the full official product name from the raw product name, brand, and search result titles. Return the canonical name.',
        },
        {
          role: 'user',
          content: `Brand: ${brandName}\nRaw product name: ${productName}\nSearch results:\n${titles.join('\n')}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'consolidated_name',
          schema: {
            type: 'object',
            properties: {
              predicted_name: { type: 'string' },
            },
            required: ['predicted_name'],
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { predicted_name?: string };
    return parsed.predicted_name ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM-powered candidate scoring
// ---------------------------------------------------------------------------

async function scoreCandidate(
  openai: OpenAI,
  productName: string,
  brandName: string,
  candidate: SerperCandidate,
): Promise<{ confidence: number }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Product: ${productName}\nBrand: ${brandName}\nURL: ${candidate.url}\nTitle: ${candidate.title}\nSnippet: ${candidate.snippet}\n\nDoes this URL appear to be an official product page? Return is_official (bool), confidence_score (0-1 float), and reason (string).`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'url_score',
          schema: {
            type: 'object',
            properties: {
              is_official: { type: 'boolean' },
              confidence_score: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['is_official', 'confidence_score', 'reason'],
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return { confidence: 0 };

    const parsed = JSON.parse(content) as { confidence_score?: number };
    return { confidence: parsed.confidence_score ?? 0 };
  } catch {
    return { confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Domain-tier helpers
// ---------------------------------------------------------------------------

function getSelectionTier(
  url: string,
  officialDomains: string[],
  preferredDomains: string[],
): 'official_domain' | 'preferred_domain' | 'organic' {
  const normalizedDomain = normalizeOfficialBrandDomain(url);
  if (!normalizedDomain) return 'organic';

  const normalizedOfficial = officialDomains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean) as string[];
  const normalizedPreferred = preferredDomains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean) as string[];

  if (
    normalizedOfficial.some((d) => normalizedDomain === d || normalizedDomain.endsWith(`.${d}`))
  ) {
    return 'official_domain';
  }

  if (
    normalizedPreferred.some((d) => normalizedDomain === d || normalizedDomain.endsWith(`.${d}`))
  ) {
    return 'preferred_domain';
  }

  return 'organic';
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Rank merged candidates by domain tier, cross-phase confirmation,
 * content signals, and LLM confidence.
 */
function rankCandidates(
  candidates: MergedCandidate[],
  confidenceScores: Map<number, number>,
  officialDomains: string[],
  preferredDomains: string[],
  sku: string,
  predictedName: string | null,
): ScoredCandidate[] {
  const normalDomain = normalizeOfficialBrandDomain;

  const normalizedOfficial = officialDomains
    .map((d) => normalDomain(d))
    .filter(Boolean) as string[];
  const normalizedPreferred = preferredDomains
    .map((d) => normalDomain(d))
    .filter(Boolean) as string[];

  const scored: Array<
    ScoredCandidate & { sortTier: number; secondaryScore: number }
  > = candidates.map((c, i) => {
    const domain = normalDomain(c.url);
    const inOfficial =
      domain !== undefined &&
      normalizedOfficial.some((d) => domain === d || domain.endsWith(`.${d}`));
    const inPreferred =
      domain !== undefined &&
      normalizedPreferred.some((d) => domain === d || domain.endsWith(`.${d}`));

    // --- Tier ---
    let tier: ScoredCandidate['selection_tier'];
    let sortTier: number;

    if (inOfficial) {
      tier = 'official_domain';
      sortTier = 0;
    } else if (inPreferred) {
      tier = 'preferred_domain';
      sortTier = 1;
    } else if (c.result_type === 'knowledge_graph') {
      tier = 'knowledge_graph';
      sortTier = 2;
    } else {
      tier = 'organic';
      sortTier = 3;
    }

    // --- Base score ---
    let composite = confidenceScores.get(i) ?? 0;

    // Domain-tier bonuses
    if (inOfficial) {
      composite += c.appeared_in_phases.length > 1 ? 100 : 80;
    } else if (inPreferred) {
      composite += c.appeared_in_phases.length > 1 ? 60 : 50;
    }

    // Cross-phase confirmation bonus
    if (c.appeared_in_phases.length > 1) {
      composite += CROSS_PHASE_BONUS;
    }

    // Knowledge Graph bonus (when not already tiered above)
    if (c.result_type === 'knowledge_graph' && !inOfficial && !inPreferred) {
      composite += KNOWLEDGE_GRAPH_BONUS;
    }

    // SKU appears in URL/title/snippet
    if (sku && `${c.url} ${c.title} ${c.snippet}`.toLowerCase().includes(sku.toLowerCase())) {
      composite += SKU_IN_CONTENT_BONUS;
    }

    // Predicted name overlap with title (≥2 words)
    if (
      predictedName &&
      c.title
    ) {
      const predictedWords = new Set(predictedName.toLowerCase().split(/\s+/).filter(Boolean));
      if (predictedWords.size >= 2) {
        const titleWords = c.title.toLowerCase().split(/\s+/);
        const overlap = titleWords.filter((w) => predictedWords.has(w)).length;
        if (overlap >= 2) {
          composite += PREDICTED_NAME_OVERLAP_BONUS;
        }
      }
    }

    return {
      ...c,
      rank: 0,
      confidence: confidenceScores.get(i) ?? 0,
      selection_tier: tier,
      composite_score: composite,
      sortTier,
      secondaryScore: composite,
    };
  });

  scored.sort((a, b) => {
    if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
    if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
    return 0;
  });

  return scored.map((item, idx) => ({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    result_type: item.result_type,
    rank: idx + 1,
    confidence: item.confidence,
    selection_tier: item.selection_tier,
    composite_score: item.composite_score,
    appeared_in_phases: item.appeared_in_phases,
  }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runOfficialBrandDiscovery(args: {
  cohortId: string;
  skus: string[];
}): Promise<{ success: boolean; skuCount: number; candidateCount: number; error?: string }> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Transition selected SKUs to searching before processing
  await supabase
    .from('products_ingestion')
    .update({ pipeline_status: 'searching', updated_at: nowIso })
    .in('sku', args.skus)
    .in('pipeline_status', ['imported', 'searching', 'url_review']);

  let credentials: AIScrapingRuntimeCredentials;
  let serperApiKey: string;
  let hasOpenAI: boolean;
  let openaiClient: OpenAI | null;
  let rows: ReturnType<typeof buildDiscoveryOfficialBrandCandidateRows>;

  try {
    credentials = await getAIScrapingRuntimeCredentials();

    if (!credentials.serper_api_key) {
      throw new Error('Serper API key not configured');
    }

    serperApiKey = credentials.serper_api_key;
    hasOpenAI = Boolean(credentials.openai_api_key);
    openaiClient = hasOpenAI ? new OpenAI({ apiKey: credentials.openai_api_key }) : null;

    const { data: productsRaw, error: productsError } = await supabase
      .from('products_ingestion')
      .select('sku, input')
      .in('sku', args.skus);

    if (productsError) {
      throw new Error(`Failed to load products: ${productsError.message}`);
    }

    const products = (productsRaw ?? []) as Array<{
      sku?: string;
      input?: { name?: string } | null;
    }>;

    const productNames = new Map<string, string>();
    for (const row of products) {
      const sku = row.sku as string;
      const name = row.input?.name?.trim();
      if (sku && name) {
        productNames.set(sku, name);
      }
    }

    const { data: cohortData, error: cohortError } = await supabase
      .from('cohort_batches')
      .select(
        'id, brand_name, brand_id, brands(id, name, official_domains, preferred_domains)',
      )
      .eq('id', args.cohortId)
      .single();

    if (cohortError || !cohortData) {
      throw new Error(`Cohort not found: ${cohortError?.message ?? 'unknown'}`);
    }

    const brandRecord = Array.isArray(cohortData.brands)
      ? (cohortData.brands as Array<Record<string, unknown>>)[0]
      : (cohortData.brands as Record<string, unknown> | null);

    const officialDomains: string[] = Array.isArray(brandRecord?.official_domains)
      ? (brandRecord.official_domains as string[])
      : [];
    const preferredDomains: string[] = Array.isArray(brandRecord?.preferred_domains)
      ? (brandRecord.preferred_domains as string[])
      : [];

    const brandId =
      typeof cohortData.brand_id === 'string'
        ? cohortData.brand_id
        : typeof brandRecord?.id === 'string'
          ? (brandRecord.id as string)
          : undefined;
    const brandName =
      typeof cohortData.brand_name === 'string'
        ? cohortData.brand_name
        : typeof brandRecord?.name === 'string'
          ? (brandRecord.name as string)
          : '';

    const resultsBySku: Record<string, SkuResult> = {};
    const skusToProcess = args.skus.filter((sku) => productNames.has(sku));

    await withConcurrency(skusToProcess, 5, async (sku) => {
      const productName = productNames.get(sku)!;

      // --------------------------------------------------------------------
      // Phase 1: SKU-based search
      // --------------------------------------------------------------------
      let phase1Results: SerperCandidate[] = [];
      try {
        const phase1Query = buildPhase1Query(sku, brandName);
        phase1Results = phase1Query
          ? await serperSearch(phase1Query, serperApiKey)
          : [];
      } catch {
        // Phase 1 failure is non-fatal — result stays empty
      }

      // --------------------------------------------------------------------
      // Phase 1.5: LLM name consolidation from Phase 1 search titles
      // --------------------------------------------------------------------
      let predictedName: string | null = null;
      if (openaiClient && phase1Results.length > 0) {
        const titles = phase1Results.map((c) => `${c.title} — ${c.url}`);
        predictedName = await consolidateName(
          openaiClient,
          productName,
          brandName,
          titles,
        );
      }
      // Fallback: use raw import name if consolidation didn't run or failed
      const effectivePredictedName = predictedName ?? productName;

      // --------------------------------------------------------------------
      // Phase 2: Predicted-name search with exclusions + site-constrained
      // --------------------------------------------------------------------
      let phase2Results: SerperCandidate[] = [];
      try {
        const phase2Base = buildPhase2Query(effectivePredictedName, brandName);
        const phase2Excluded = buildExclusionQuery(phase2Base);
        if (phase2Excluded) {
          phase2Results = await serperSearchPhase2(
            phase2Excluded,
            serperApiKey,
            officialDomains,
            preferredDomains,
          );
        }
      } catch {
        // Phase 2 failure is non-fatal
      }

      // --------------------------------------------------------------------
      // Phase 3: Merge + LLM scoring (top N) + ranking
      // --------------------------------------------------------------------
      const merged = mergeAndDedupeCandidates(phase1Results, phase2Results);

      const confidenceScores = new Map<number, number>();
      const topN = merged.slice(0, MAX_SCORED_CANDIDATES);
      if (openaiClient) {
        for (let i = 0; i < merged.length; i++) {
          if (topN.includes(merged[i])) {
            const result = await scoreCandidate(
              openaiClient,
              productName,
              brandName,
              merged[i],
            );
            confidenceScores.set(i, result.confidence);
          } else {
            confidenceScores.set(i, 0);
          }
        }
      } else {
        for (let i = 0; i < merged.length; i++) {
          confidenceScores.set(i, 0);
        }
      }

      const scored = rankCandidates(
        merged,
        confidenceScores,
        officialDomains,
        preferredDomains,
        sku,
        effectivePredictedName,
      );

      const topCandidate = scored.length > 0 ? scored[0] : null;

      resultsBySku[sku] = {
        official_brand: {
          selected_url: topCandidate?.url ?? '',
          url: topCandidate?.url ?? '',
          candidates: scored,
          confidence: topCandidate?.confidence ?? 0,
          predicted_name: predictedName,
          status: scored.length > 0 ? 'found' : 'not_found',
          phase1_result_count: phase1Results.length,
          phase2_result_count: phase2Results.length,
        },
      };
    });

    const cohort = {
      id: args.cohortId,
      brandId,
      brandName,
      officialDomains,
      preferredDomains,
    };

    rows = buildDiscoveryOfficialBrandCandidateRows({
      jobId: null,
      resultsBySku: resultsBySku as unknown as Record<string, Record<string, unknown>>,
      cohort,
      nowIso,
    });

    await persistOfficialBrandCandidateRows(supabase, rows);

    // Move ALL SKUs to url_review (even those with no candidates — admin can manually add URLs)
    await supabase
      .from('products_ingestion')
      .update({ pipeline_status: 'url_review', updated_at: nowIso })
      .in('sku', args.skus)
      .eq('pipeline_status', 'searching');

    return { success: true, skuCount: args.skus.length, candidateCount: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Official Brand Discovery] Failed:', message);
    // Revert products to imported on failure
    await supabase
      .from('products_ingestion')
      .update({
        pipeline_status: 'imported',
        updated_at: new Date().toISOString(),
      })
      .in('sku', args.skus)
      .eq('pipeline_status', 'searching');
    return { success: false, skuCount: 0, candidateCount: 0, error: message };
  }
}
