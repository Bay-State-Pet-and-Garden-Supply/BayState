import type { EvaluatedCandidate } from "../schemas/CandidateUrl";
import type { ProductResearchInput } from "../schemas/ProductResearchInput";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import type { StorefrontProductDraft } from "../schemas/StorefrontProduct";
import type {
  AcquiredPage,
  DiscoveryResult,
  PageFactSet,
  ProductResearchBrief,
  ProductResearchPipelineContext,
  VerificationResult,
} from "./types";

export interface ResearchBriefBuilder {
  buildBrief(input: ProductResearchInput, context: ProductResearchPipelineContext): Promise<ProductResearchBrief>;
}

export interface CandidateDiscoveryProvider {
  discoverCandidates(brief: ProductResearchBrief, context: ProductResearchPipelineContext): Promise<DiscoveryResult>;
}

export interface PageAcquisitionProvider {
  acquirePage(url: string, brief: ProductResearchBrief, context: ProductResearchPipelineContext): Promise<AcquiredPage>;
}

export interface PageFactExtractor {
  extractFacts(page: AcquiredPage, brief: ProductResearchBrief, context: ProductResearchPipelineContext): Promise<PageFactSet>;
}

export interface CandidateVerifier {
  verifyCandidate(candidate: EvaluatedCandidate, facts: PageFactSet | undefined, brief: ProductResearchBrief, context: ProductResearchPipelineContext): Promise<VerificationResult>;
}

export interface AgentAdjudicator {
  adjudicateCandidates(report: ProductResearchReport, context: ProductResearchPipelineContext): Promise<ProductResearchReport>;
}

export interface StorefrontProductAssembler {
  assembleStorefrontProduct(report: ProductResearchReport, context: ProductResearchPipelineContext): Promise<StorefrontProductDraft>;
}

export interface ProductResearchPipelinePorts {
  briefBuilder: ResearchBriefBuilder;
  discoveryProviders: CandidateDiscoveryProvider[];
  pageAcquisition: PageAcquisitionProvider;
  factExtractors: PageFactExtractor[];
  verifier: CandidateVerifier;
  adjudicator?: AgentAdjudicator;
  assembler: StorefrontProductAssembler;
}
