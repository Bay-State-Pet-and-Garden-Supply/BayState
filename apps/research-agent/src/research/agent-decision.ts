import {
  agentCandidateDecisionSchema,
  productResearchReportSchema,
  type AgentCandidateDecision,
  type ProductResearchReport,
} from "../schemas/ProductResearchReport";

export interface AttachAgentDecisionOptions {
  recordedAt?: Date;
}

export type AgentDecisionInput = Pick<
  AgentCandidateDecision,
  "selectedUrl" | "rationale" | "confidence" | "defer"
>;

export function attachAgentDecisionToReport(
  report: ProductResearchReport,
  decision: AgentDecisionInput,
  options: AttachAgentDecisionOptions = {},
): ProductResearchReport {
  const selectedUrl = decision.selectedUrl?.trim() || undefined;
  const rationale = decision.rationale.trim();
  const defer = decision.defer ?? !selectedUrl;

  if (!defer && !selectedUrl) {
    throw new Error("selectedUrl is required unless defer=true.");
  }

  const candidateUrls = new Set(report.candidates.map((candidate) => candidate.normalizedUrl));
  if (selectedUrl && !candidateUrls.has(selectedUrl)) {
    throw new Error("selectedUrl must match one of the report candidate URLs.");
  }

  const validatedDecision = agentCandidateDecisionSchema.parse({
    selectedUrl,
    rationale,
    confidence: decision.confidence,
    defer,
    recordedAt: (options.recordedAt ?? new Date()).toISOString(),
    source: "pi_harness",
  });

  return productResearchReportSchema.parse({
    ...report,
    agentDecision: validatedDecision,
  });
}
