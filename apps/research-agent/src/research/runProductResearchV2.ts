import { runProductResearchPipeline } from "../pipeline/runProductResearchPipeline";
import { DefaultBriefBuilder } from "../pipeline/brief/brief-builder";
import { StaticCandidateDiscovery } from "../pipeline/discovery/static-candidate-discovery";
import { OfficialDomainDiscovery } from "../pipeline/discovery/official-domain-discovery";
import { SerperCandidateDiscovery } from "../pipeline/discovery/serper-candidate-discovery";
import { HttpPageAcquisition } from "../pipeline/acquisition/http-page-acquisition";
import { AgentBrowserPageAcquisition } from "../pipeline/acquisition/agent-browser-acquisition";
import { JsonLdExtractor } from "../pipeline/extraction/jsonld-extractor";
import { MetaExtractor } from "../pipeline/extraction/meta-extractor";
import { TextHeuristicExtractor } from "../pipeline/extraction/text-heuristic-extractor";
import { ProductDomExtractor } from "../pipeline/extraction/product-dom-extractor";
import { DefaultCandidateVerifier } from "../pipeline/verification/candidate-verifier";
import { assembleStorefrontProductDraft } from "../pipeline/storefront-assembly";
import type { ProductResearchPipelineResult } from "../pipeline/types";
import type { ProductResearchPipelinePorts } from "../pipeline/ports";

import type { PageAcquisitionProvider } from "../pipeline/ports";
import type { AcquiredPage } from "../pipeline/types";
import { PageIndexDb } from "../cache/page-index-db";
import { PageIndexRepository } from "../cache/page-index-repository";
import { OfficialDomainIndexDiscovery } from "../pipeline/discovery/official-domain-index-discovery";
import type { CandidateDiscoveryProvider } from "../pipeline/ports";

class NoOpPageAcquisition implements PageAcquisitionProvider {
  async acquirePage(url: string): Promise<AcquiredPage> {
    return {
      url,
      finalUrl: url,
      fetchedAt: new Date().toISOString(),
      metadata: { note: "Page acquisition skipped" },
    };
  }
}

export interface RunProductResearchV2Options {
  topN?: number;
  now?: Date;
  runId?: string;
  artifactRoot?: string;
  pageAcquisition?: "http" | "agent-browser" | "auto" | "none";
  savePageArtifacts?: boolean;
  indexing?: "off" | "lookup-only" | "refresh-stale" | "cold-start";
  forceIndexRefresh?: boolean;
}

export async function runProductResearchV2(
  rawInput: unknown,
  options: RunProductResearchV2Options = {}
): Promise<ProductResearchPipelineResult> {
  const topN = options.topN ?? 3;
  const now = options.now ?? new Date();
  const indexing = options.indexing ?? "cold-start";
  const forceIndexRefresh = options.forceIndexRefresh ?? false;
  const acquisitionMode = options.pageAcquisition ?? "auto";

  let db: PageIndexDb | undefined;

  try {
    const httpAcquisition = new HttpPageAcquisition({ timeoutMs: 8_000 });
    const browserAcquisition = new AgentBrowserPageAcquisition({
      commandTimeoutMs: 12_000,
      renderWaitMs: 1_500,
    });

    const pageAcquisition = acquisitionMode === "agent-browser"
      ? browserAcquisition
      : acquisitionMode === "none"
        ? new NoOpPageAcquisition()
        : httpAcquisition;

    const fallbackPageAcquisition = acquisitionMode === "auto"
      ? browserAcquisition
      : undefined;

    const factExtractors = [
      new JsonLdExtractor(),
      new MetaExtractor(),
      new TextHeuristicExtractor(),
      new ProductDomExtractor(),
    ];

    const discoveryProviders: CandidateDiscoveryProvider[] = [];
    if (indexing !== "off") {
      db = new PageIndexDb();
      const repository = new PageIndexRepository(db);
      discoveryProviders.push(
        new OfficialDomainIndexDiscovery({
          repository,
          indexingMode: indexing,
          pageAcquisition: httpAcquisition,
          factExtractors,
          forceIndexRefresh,
          maxElapsedMs: indexing === "refresh-stale" ? 15_000 : 20_000,
          perPageTimeoutMs: 6_000,
          maxPagesFetched: indexing === "refresh-stale" ? 8 : 12,
          maxUrlsDiscovered: 500,
        }),
      );
    }

    discoveryProviders.push(
      new OfficialDomainDiscovery(),
      new SerperCandidateDiscovery(),
      new StaticCandidateDiscovery(),
    );

    const ports: ProductResearchPipelinePorts = {
      briefBuilder: new DefaultBriefBuilder(),
      discoveryProviders,
      pageAcquisition,
      fallbackPageAcquisition,
      factExtractors,
      verifier: new DefaultCandidateVerifier(),
      assembler: {
        async assembleStorefrontProduct(report, context) {
          return assembleStorefrontProductDraft(report, {
            generatedAt: context.now,
          });
        },
      },
    };

    return await runProductResearchPipeline(rawInput, ports, {
      now,
      runId: options.runId,
      topN,
      artifactRoot: options.artifactRoot || (options.savePageArtifacts ? undefined : undefined),
    });
  } finally {
    db?.close();
  }
}
