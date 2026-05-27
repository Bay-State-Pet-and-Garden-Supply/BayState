import { runProductResearchPipeline } from "../pipeline/runProductResearchPipeline";
import { DefaultBriefBuilder } from "../pipeline/brief/brief-builder";
import { StaticCandidateDiscovery } from "../pipeline/discovery/static-candidate-discovery";
import { OfficialDomainDiscovery } from "../pipeline/discovery/official-domain-discovery";
import { HttpPageAcquisition } from "../pipeline/acquisition/http-page-acquisition";
import { AgentBrowserPageAcquisition } from "../pipeline/acquisition/agent-browser-acquisition";
import { JsonLdExtractor } from "../pipeline/extraction/jsonld-extractor";
import { MetaExtractor } from "../pipeline/extraction/meta-extractor";
import { TextHeuristicExtractor } from "../pipeline/extraction/text-heuristic-extractor";
import { DefaultCandidateVerifier } from "../pipeline/verification/candidate-verifier";
import { assembleStorefrontProductDraft } from "../pipeline/storefront-assembly";
import type { ProductResearchPipelineResult } from "../pipeline/types";
import type { ProductResearchPipelinePorts } from "../pipeline/ports";

import type { PageAcquisitionProvider } from "../pipeline/ports";
import type { AcquiredPage } from "../pipeline/types";

export class NoOpPageAcquisition implements PageAcquisitionProvider {
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
  pageAcquisition?: "http" | "agent-browser" | "none";
  savePageArtifacts?: boolean;
}

export async function runProductResearchV2(
  rawInput: unknown,
  options: RunProductResearchV2Options = {}
): Promise<ProductResearchPipelineResult> {
  const topN = options.topN ?? 3;
  const now = options.now ?? new Date();

  // Choose the page acquisition provider
  const pageAcquisition = options.pageAcquisition === "agent-browser"
    ? new AgentBrowserPageAcquisition()
    : options.pageAcquisition === "none"
      ? new NoOpPageAcquisition()
      : new HttpPageAcquisition();

  const ports: ProductResearchPipelinePorts = {
    briefBuilder: new DefaultBriefBuilder(),
    discoveryProviders: [
      new StaticCandidateDiscovery(),
      new OfficialDomainDiscovery(),
    ],
    pageAcquisition,
    factExtractors: [
      new JsonLdExtractor(),
      new MetaExtractor(),
      new TextHeuristicExtractor(),
    ],
    verifier: new DefaultCandidateVerifier(),
    assembler: {
      async assembleStorefrontProduct(report, context) {
        return assembleStorefrontProductDraft(report, {
          generatedAt: context.now,
        });
      },
    },
  };

  return runProductResearchPipeline(rawInput, ports, {
    now,
    runId: options.runId,
    topN,
    artifactRoot: options.artifactRoot || (options.savePageArtifacts ? undefined : undefined), // Can be configured further
  });
}
