import type { CandidateDiscoveryProvider, PageAcquisitionProvider, PageFactExtractor } from "../ports";
import type {
  CandidateUrlInput,
  DiscoveryResult,
  PipelineWarning,
  ProductResearchBrief,
  ProductResearchPipelineContext,
} from "../types";
import type { PageIndexRepository } from "../../cache/page-index-repository";
import { OfficialDomainIndexer } from "./official-domain-indexer";

export interface OfficialDomainIndexDiscoveryOptions {
  repository: PageIndexRepository;
  indexingMode?: "off" | "lookup-only" | "refresh-stale" | "cold-start";
  pageAcquisition?: PageAcquisitionProvider;
  factExtractors?: PageFactExtractor[];
  forceIndexRefresh?: boolean;
  maxElapsedMs?: number;
  perPageTimeoutMs?: number;
  maxPagesFetched?: number;
  maxUrlsDiscovered?: number;
}

export class OfficialDomainIndexDiscovery implements CandidateDiscoveryProvider {
  private readonly repository: PageIndexRepository;
  private readonly indexingMode: "off" | "lookup-only" | "refresh-stale" | "cold-start";
  private readonly pageAcquisition?: PageAcquisitionProvider;
  private readonly factExtractors?: PageFactExtractor[];
  private readonly forceIndexRefresh: boolean;
  private readonly maxElapsedMs: number;
  private readonly perPageTimeoutMs: number;
  private readonly maxPagesFetched: number;
  private readonly maxUrlsDiscovered: number;

  constructor(options: OfficialDomainIndexDiscoveryOptions) {
    this.repository = options.repository;
    this.indexingMode = options.indexingMode ?? "cold-start";
    this.pageAcquisition = options.pageAcquisition;
    this.factExtractors = options.factExtractors;
    this.forceIndexRefresh = options.forceIndexRefresh ?? false;
    this.maxElapsedMs = options.maxElapsedMs ?? 20_000;
    this.perPageTimeoutMs = options.perPageTimeoutMs ?? 6_000;
    this.maxPagesFetched = options.maxPagesFetched ?? 12;
    this.maxUrlsDiscovered = options.maxUrlsDiscovered ?? 500;
  }

  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<DiscoveryResult> {
    const candidates: CandidateUrlInput[] = [];
    const warnings: PipelineWarning[] = [];
    const domain = brief.resolvedInput.officialDomainResolved;
    const upc = brief.resolvedInput.upc;

    if (!domain) {
      warnings.push({
        stage: "discovery",
        message: "No official domain resolved; skipped index-based candidate discovery.",
      });
      return { candidates, warnings };
    }

    try {
      // 1. Initial lookup from cache
      let exactMatches = await this.repository.searchByUpc({ upc, domain });
      let textMatches = exactMatches.length === 0
        ? await this.repository.searchByText({ text: brief.resolvedInput.registerName, domain })
        : [];

      // 2. Determine if cold-start or stale indexing is required
      const isIndexingEnabled = this.indexingMode === "cold-start" || this.indexingMode === "refresh-stale";

      if (this.pageAcquisition && this.factExtractors && (isIndexingEnabled || this.forceIndexRefresh)) {
        let shouldIndex = this.forceIndexRefresh;

        if (!shouldIndex) {
          if (this.indexingMode === "cold-start") {
            shouldIndex = exactMatches.length === 0 && textMatches.length === 0;
          } else if (this.indexingMode === "refresh-stale") {
            const staleUrls = await this.repository.getStaleProductLikeUrls(domain, { limit: 1 });
            shouldIndex = staleUrls.length > 0;
          }
        }

        if (shouldIndex) {
          const indexer = new OfficialDomainIndexer();
          const indexResult = await indexer.indexDomainForBrief(brief, context, {
            pageAcquisition: this.pageAcquisition,
            factExtractors: this.factExtractors,
            repository: this.repository,
            forceRefresh: this.forceIndexRefresh,
            maxElapsedMs: this.maxElapsedMs,
            perPageTimeoutMs: this.perPageTimeoutMs,
            maxPagesFetched: this.maxPagesFetched,
            maxUrlsDiscovered: this.maxUrlsDiscovered,
          });

          if (indexResult.error) {
            warnings.push({
              stage: "discovery",
              message: `Indexing failed during discovery: ${indexResult.error}`,
            });
          }

          exactMatches = await this.repository.searchByUpc({ upc, domain });
          textMatches = exactMatches.length === 0
            ? await this.repository.searchByText({ text: brief.resolvedInput.registerName, domain })
            : [];
        }
      }

      // 3. Return exact UPC matches if found
      if (exactMatches.length > 0) {
        for (const match of exactMatches) {
          candidates.push({
            url: match.url,
            sourceType: "official",
            title: match.title,
            snippet: match.description,
            discoveredFrom: "page-index:exact-upc",
          });
        }
      } else {
        // 4. Fallback to FTS text search on UPC miss
        for (const match of textMatches) {
          candidates.push({
            url: match.url,
            sourceType: "official",
            title: match.title,
            snippet: match.description,
            discoveredFrom: "page-index:text-search",
          });
        }
      }

      if (candidates.length === 0) {
        warnings.push({
          stage: "discovery",
          message: `Official domain index miss for UPC ${upc} and brand ${brief.resolvedInput.brand} on domain ${domain}.`,
        });
      }
    } catch (err: any) {
      warnings.push({
        stage: "discovery",
        message: `Official domain index discovery failed: ${err.message || String(err)}`,
      });
    }

    return { candidates, warnings };
  }
}
