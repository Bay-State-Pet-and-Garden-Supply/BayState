import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getAIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';
import type { AIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';
import {
  buildDiscoveryOfficialBrandCandidateRows,
  persistOfficialBrandCandidateRows,
  buildNormalizedDomainList,
} from '@/lib/official-brand-workflow';
import {
  type SerperCandidate,
  type ScoredCandidate,
  buildPhase1Query,
  buildPhase2Query,
  buildExclusionQuery,
  buildSiteConstrainedQueries,
  mergeAndDedupeCandidates,
  rankCandidates,
} from '@/lib/official-brand-scoring';

const MAX_SCORED_CANDIDATES = 5;

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

    // Clear existing candidates for these SKUs to avoid accumulation on rerun
    await supabase
      .from('official_brand_url_candidates')
      .delete()
      .eq('cohort_id', args.cohortId)
      .in('sku', args.skus);

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

    const rawOfficialDomains: string[] = Array.isArray(brandRecord?.official_domains)
      ? (brandRecord.official_domains as string[])
      : [];
    const rawPreferredDomains: string[] = Array.isArray(brandRecord?.preferred_domains)
      ? (brandRecord.preferred_domains as string[])
      : [];

    const officialDomains = buildNormalizedDomainList(rawOfficialDomains);
    const preferredDomains = buildNormalizedDomainList(rawPreferredDomains);

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
