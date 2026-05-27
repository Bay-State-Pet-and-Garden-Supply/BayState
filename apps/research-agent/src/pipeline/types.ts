import type { CandidateUrlInput, EvaluatedCandidate } from "../schemas/CandidateUrl";
import type { ProductResearchInput, ResolvedProductResearchInput } from "../schemas/ProductResearchInput";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import type { StorefrontProductDraft } from "../schemas/StorefrontProduct";

export type { CandidateUrlInput, EvaluatedCandidate };

export type ProductResearchStageName =
  | "brief"
  | "discovery"
  | "acquisition"
  | "extraction"
  | "verification"
  | "adjudication"
  | "assembly"
  | "qa";

export interface PipelineWarning {
  stage: ProductResearchStageName;
  message: string;
  url?: string;
}

export interface ProductResearchBrief {
  input: ProductResearchInput;
  resolvedInput: ResolvedProductResearchInput;
  constraints: {
    requireIdentityEvidence: boolean;
    preferOfficialSource: boolean;
    allowDistributorCanonical: boolean;
  };
}

export interface DiscoveryResult {
  candidates: CandidateUrlInput[];
  warnings: PipelineWarning[];
}

export interface AcquiredPage {
  url: string;
  finalUrl: string;
  statusCode?: number;
  fetchedAt: string;
  title?: string;
  html?: string;
  text?: string;
  screenshotPath?: string;
  accessibilitySnapshot?: string;
  metadata: Record<string, unknown>;
}

export interface PageFactSet {
  sourceUrl: string;
  title?: string;
  description?: string;
  images: string[];
  categories: string[];
  attributes: Record<string, unknown>;
  evidenceSnippets: string[];
  confidence: number;
  jsonLd?: Record<string, unknown>[];
}

export interface VerificationResult {
  candidate: EvaluatedCandidate;
  facts?: PageFactSet;
  identityConfidence: number;
  variantConfidence: number;
  storefrontReadinessContribution: number;
  warnings: PipelineWarning[];
}

export interface ProductResearchPipelineResult {
  report: ProductResearchReport;
  storefrontProduct?: StorefrontProductDraft;
  warnings: PipelineWarning[];
}

export interface ProductResearchPipelineContext {
  now: Date;
  artifactRoot?: string;
  runId?: string;
}
