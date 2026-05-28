import type { PageAcquisitionProvider, PageFactExtractor } from "../ports";
import type { PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { discoverUrlsFromSitemap, discoverSitemapsFromRobotsTxt } from "./sitemap-url-discovery";
import { classifyProductUrlHeuristics } from "./product-url-classifier";
import type { PageIndexRepository } from "../../cache/page-index-repository";
import { mergePageFacts } from "../extraction/product-fact-extractor";
import { normalizeBarcode, normalizeBarcodes } from "../../lib/barcode";
import { isSameOrSubdomain } from "../../lib/url";
import { overlapScore, tokenizeText } from "../../lib/tokens";

export interface OfficialDomainIndexingOptions {
  pageAcquisition: PageAcquisitionProvider;
  factExtractors: PageFactExtractor[];
  repository: PageIndexRepository;
  maxUrlsDiscovered?: number;
  maxPagesFetched?: number;
  ttlDays?: number;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  maxElapsedMs?: number;
  perPageTimeoutMs?: number;
  candidatePoolMultiplier?: number;
  sitemapMaxSitemaps?: number;
}

export interface OfficialDomainIndexingResult {
  urlsDiscovered: number;
  urlsFetched: number;
  urlsIndexed: number;
  error?: string;
  timedOut?: boolean;
}

function extractUpcsFromFactSet(facts: PageFactSet): string[] {
  return normalizeBarcodes([
    facts.attributes.gtin as string | undefined,
    facts.attributes.gtin8 as string | undefined,
    facts.attributes.gtin12 as string | undefined,
    facts.attributes.gtin13 as string | undefined,
    facts.attributes.gtin14 as string | undefined,
    facts.attributes.sku as string | undefined,
    facts.attributes.mpn as string | undefined,
    ...(Array.isArray(facts.attributes.heuristicUpcs) ? facts.attributes.heuristicUpcs : []),
  ]);
}

function buildPriorityTokens(brief: ProductResearchBrief): string[] {
  const brandTokens = new Set(tokenizeText(brief.input.brand));
  return tokenizeText(brief.input.registerName).filter((token) => !brandTokens.has(token));
}

function rankUrlsForBrief(urls: string[], brief: ProductResearchBrief): string[] {
  const priorityTokens = buildPriorityTokens(brief);
  const normalizedUpc = normalizeBarcode(brief.input.upc);

  return [...urls]
    .map((url) => {
      const urlTokens = tokenizeText(url);
      const overlap = overlapScore(priorityTokens, urlTokens).score;
      const { score: heuristicScore, isProductLike } = classifyProductUrlHeuristics(url, brief.input.brand);
      const lowerUrl = url.toLowerCase();
      const urlDigits = url.replace(/\D+/g, "");

      let score = overlap * 0.55 + heuristicScore * 0.35;
      if (normalizedUpc && urlDigits.includes(normalizedUpc)) {
        score += 0.5;
      }
      if (lowerUrl.includes("/products/")) {
        score += 0.08;
      }
      if (lowerUrl.includes("?")) {
        score -= 0.03;
      }
      if (!isProductLike) {
        score -= 0.25;
      }

      return { url, score };
    })
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .map((item) => item.url);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isSuccessfulPage(page: Awaited<ReturnType<PageAcquisitionProvider["acquirePage"]>>) {
  const statusCode = page.statusCode ?? 0;
  return !page.metadata?.error && statusCode >= 200 && statusCode < 300 && Boolean(page.html || page.text);
}

export class OfficialDomainIndexer {
  async indexDomainForBrief(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
    options: OfficialDomainIndexingOptions,
  ): Promise<OfficialDomainIndexingResult> {
    const domain = brief.resolvedInput.officialDomainResolved;
    if (!domain) {
      return { urlsDiscovered: 0, urlsFetched: 0, urlsIndexed: 0, error: "No official domain resolved in brief." };
    }

    const {
      pageAcquisition,
      factExtractors,
      repository,
      maxUrlsDiscovered = 500,
      maxPagesFetched = 50,
      ttlDays = 7,
      forceRefresh = false,
      maxElapsedMs = 20_000,
      perPageTimeoutMs = 6_000,
      candidatePoolMultiplier = 8,
      sitemapMaxSitemaps = 50,
    } = options;

    const deadlineAt = Date.now() + maxElapsedMs;

    try {
      await repository.upsertDomain({
        normalizedDomain: domain,
        officialWebsiteUrl: brief.input.officialWebsiteUrl,
        brandName: brief.input.brand,
      });

      await repository.updateDomainCrawlStartedAt(domain);
      const robotsSitemaps = await discoverSitemapsFromRobotsTxt(domain, options.fetchImpl).catch(() => []);
      const sitemapUrls = [
        ...robotsSitemaps,
        `https://${domain}/sitemap.xml`,
        `https://www.${domain}/sitemap.xml`
      ].filter((val, idx, self) => self.indexOf(val) === idx);
      const discoveredSet = new Set<string>();

      const customFetch = async (url: string, init?: RequestInit) => {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          throw new Error("Indexing deadline exceeded before sitemap fetch completed.");
        }

        try {
          const res = await (options.fetchImpl || fetch)(url, {
            ...init,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              ...(init?.headers ?? {}),
            },
            signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, remainingMs))),
          });
          if (res.ok) return res;
        } catch {
          // Standard fetch failed/threw connection error; try browser fallback
        }

        if (pageAcquisition && typeof (pageAcquisition as any).runCommand === "function") {
          const runner = pageAcquisition as any;
          const openRes = await runner.runCommand(["open", url, "--json"]);
          if (openRes && openRes.success !== false) {
            const htmlRes = await runner.runCommand(["get", "html", "html", "--json"]);
            if (htmlRes && htmlRes.success && htmlRes.data?.html) {
              return {
                ok: true,
                headers: { get: () => null },
                arrayBuffer: async () => Buffer.from(htmlRes.data.html, "utf8"),
                text: async () => htmlRes.data.html,
              } as unknown as Response;
            }
          }
        }

        throw new Error(`Failed to fetch sitemap: ${url}`);
      };

      for (const sitemapUrl of sitemapUrls) {
        if (Date.now() >= deadlineAt || discoveredSet.size >= maxUrlsDiscovered) {
          break;
        }

        const urls = await discoverUrlsFromSitemap(sitemapUrl, customFetch, {
          maxSitemaps: sitemapMaxSitemaps,
          maxUrls: maxUrlsDiscovered - discoveredSet.size,
          deadlineAt,
        }).catch(() => []);

        for (const url of urls) {
          if (isSameOrSubdomain(url, domain)) {
            discoveredSet.add(url);
          }
          if (discoveredSet.size >= maxUrlsDiscovered) break;
        }
      }

      await repository.updateDomainSitemapCheckedAt(domain);

      const discoveredList = Array.from(discoveredSet).map((url) => {
        const { isProductLike } = classifyProductUrlHeuristics(url, brief.input.brand);
        return {
          url,
          isProductLike,
          discoveredFrom: "sitemap",
        };
      });

      if (discoveredList.length > 0) {
        await repository.upsertDiscoveredUrls(domain, discoveredList);
      }

      const fetchTtl = forceRefresh ? 0 : ttlDays;
      const urlPool = await repository.getStaleProductLikeUrls(domain, {
        limit: Math.max(maxPagesFetched, maxPagesFetched * candidatePoolMultiplier),
        ttlDays: fetchTtl,
      });
      const urlsToFetch = rankUrlsForBrief(urlPool, brief).slice(0, maxPagesFetched);

      let urlsFetched = 0;
      let urlsIndexed = 0;
      let timedOut = false;

      for (const url of urlsToFetch) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          timedOut = true;
          break;
        }

        try {
          const page = await withTimeout(
            pageAcquisition.acquirePage(url, brief, context),
            Math.max(1, Math.min(perPageTimeoutMs, remainingMs)),
            `Page acquisition timed out after ${Math.max(1, Math.min(perPageTimeoutMs, remainingMs))}ms for ${url}`,
          );
          urlsFetched++;

          if (!isSuccessfulPage(page)) {
            await repository.markFetchResult(url, {
              status: page.statusCode ?? 599,
              error: page.metadata?.error ? String(page.metadata.error) : "Skipping non-2xx or empty page during indexing",
              title: page.title,
              textExcerpt: page.text?.slice(0, 500),
              isProductLike: true,
            });
            continue;
          }

          const factSets: PageFactSet[] = [];
          for (const extractor of factExtractors) {
            try {
              const facts = await extractor.extractFacts(page, brief, context);
              factSets.push(facts);
            } catch {
              // Individual extractor failure is non-fatal
            }
          }

          if (factSets.length === 0) {
            await repository.markFetchResult(url, {
              status: page.statusCode ?? 200,
              title: page.title,
              textExcerpt: page.text?.slice(0, 500),
              error: "No fact extractors produced output for indexed page",
              isProductLike: true,
            });
            continue;
          }

          const mergedFacts = mergePageFacts(factSets);
          const upcs = extractUpcsFromFactSet(mergedFacts);

          await repository.upsertPageFacts({
            url,
            title: mergedFacts.title ?? page.title,
            description: mergedFacts.description,
            images: mergedFacts.images,
            categories: mergedFacts.categories,
            attributes: mergedFacts.attributes,
            upcs,
            brand: brief.input.brand,
            confidence: mergedFacts.confidence,
            evidence: mergedFacts.evidenceSnippets,
            jsonld: mergedFacts.jsonLd,
          });

          await repository.markFetchResult(url, {
            status: page.statusCode ?? 200,
            contentHash: page.metadata?.contentHash as string | undefined,
            title: mergedFacts.title ?? page.title,
            description: mergedFacts.description,
            textExcerpt: page.text?.slice(0, 500),
            isProductLike: true,
          });

          urlsIndexed++;
        } catch (e: any) {
          const errorMessage = e?.message || String(e);
          if (/timed out/i.test(errorMessage)) {
            timedOut = true;
          }

          await repository.markFetchResult(url, {
            status: 599,
            error: errorMessage,
            isProductLike: true,
          });

          if (timedOut) {
            break;
          }
        }
      }

      await repository.updateDomainCrawlCompletedAt(domain);

      return {
        urlsDiscovered: discoveredList.length,
        urlsFetched,
        urlsIndexed,
        ...(timedOut ? { error: "Indexing stopped after reaching time limit.", timedOut: true } : {}),
      };
    } catch (err: any) {
      return {
        urlsDiscovered: 0,
        urlsFetched: 0,
        urlsIndexed: 0,
        error: err.message || String(err),
      };
    }
  }
}
