import { dedupeCandidates, rankCandidates, resolveInput } from "../lib/candidate-scoring";
import { productResearchInputSchema } from "../schemas/ProductResearchInput";
import {
  extractedResearchFieldsSchema,
  productResearchReportSchema,
  type ProductResearchReport,
} from "../schemas/ProductResearchReport";
import {
  unavailableScraperExtractionAdapter,
  type ScraperExtractionAdapter,
} from "../adapters/scraper-extraction";

export interface RunProductResearchOptions {
  extractionAdapter?: ScraperExtractionAdapter;
  now?: Date;
  runId?: string;
}

function createRunId(productId: string, now: Date) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `research-${timestamp}-${productId}`;
}

function computeExtractionCompleteness(report: ReturnType<typeof extractedResearchFieldsSchema.parse>): number {
  const checks = [
    Boolean(report.description),
    Boolean(report.images?.value?.length),
    Boolean(report.categories?.value?.length),
    Boolean(report.attributes && Object.keys(report.attributes.value).length > 0),
  ];

  return checks.filter(Boolean).length / checks.length;
}

function firstExtractedAttributeString(
  extracted: ReturnType<typeof extractedResearchFieldsSchema.parse>,
  keys: string[],
): string | undefined {
  const attributes = extracted.attributes?.value;
  if (!attributes) return undefined;

  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      if (first) return first.trim();
    }
  }

  return undefined;
}

function buildExtractedIdentityFields(
  extracted: ReturnType<typeof extractedResearchFieldsSchema.parse>,
): Partial<ProductResearchReport["productIdentity"]> {
  const attributes = extracted.attributes;
  if (!attributes) return {};

  const toEvidence = (value: string) => ({
    value,
    confidence: attributes.confidence,
    sourceType: attributes.sourceType,
    sourceUrl: attributes.sourceUrl,
    evidence: attributes.evidence,
  });

  const size = firstExtractedAttributeString(extracted, ["size", "weight", "netWeight", "heuristicSizes"]);
  const flavor = firstExtractedAttributeString(extracted, ["flavor", "flavour"]);
  const variant = firstExtractedAttributeString(extracted, ["variant", "formula", "style", "mpn"]);

  return {
    ...(size ? { size: toEvidence(size) } : {}),
    ...(flavor ? { flavor: toEvidence(flavor) } : {}),
    ...(variant ? { variant: toEvidence(variant) } : {}),
  };
}

function buildNextActions(
  status: ProductResearchReport["status"],
  extractionStatus: "success" | "unavailable" | "failed",
): string[] {
  const actions: string[] = [];

  if (status === "needs_more_candidates") {
    actions.push("Configure SERP/domain discovery or provide developer seed URLs for investigation.");
  }

  if (status === "needs_review") {
    actions.push("Review the top candidate URLs before accepting a canonical product page.");
  }

  if (extractionStatus === "unavailable") {
    actions.push("Add a narrow scraper-side known-URL extraction wrapper before web integration.");
  }

  if (extractionStatus === "failed") {
    actions.push("Inspect scraper extraction wrapper output before trusting extracted fields.");
  }

  if (actions.length === 0) {
    actions.push("Promote the stabilized report schema into packages/api before coordinator integration.");
  }

  return actions;
}

export async function runProductResearch(
  rawInput: unknown,
  options: RunProductResearchOptions = {},
): Promise<ProductResearchReport> {
  const parsedInput = productResearchInputSchema.parse(rawInput);
  const resolvedInput = resolveInput(parsedInput);
  const now = options.now ?? new Date();
  const runId = options.runId ?? createRunId(parsedInput.productId, now);
  const extractionAdapter = options.extractionAdapter ?? unavailableScraperExtractionAdapter;

  const candidates = dedupeCandidates(resolvedInput.seedCandidateUrls);
  const rankedCandidates = rankCandidates(resolvedInput, candidates);
  const selectedCandidate = rankedCandidates.find((candidate) => candidate.decision === "selected");

  let extractionStatus: "success" | "unavailable" | "failed" = "unavailable";
  let extracted = extractedResearchFieldsSchema.parse({});
  const warnings = new Set<string>();

  if (!resolvedInput.officialDomainResolved) {
    warnings.add("Official domain is missing or could not be normalized.");
  }

  if (rankedCandidates.length === 0) {
    warnings.add("No developer seed URLs were provided for legacy scoring.");
  }

  if (selectedCandidate) {
    const extractionResult = await extractionAdapter.extract(resolvedInput, selectedCandidate);
    extractionStatus = extractionResult.status;

    if (extractionResult.warnings) {
      for (const warning of extractionResult.warnings) {
        warnings.add(warning);
      }
    }

    if (extractionResult.status === "success") {
      extracted = extractedResearchFieldsSchema.parse(extractionResult.extracted);
    } else {
      warnings.add(extractionResult.reason);
    }
  } else if (rankedCandidates.length > 0) {
    warnings.add("No candidate cleared the automatic selection threshold.");
  }

  const candidateWarnings = selectedCandidate
    ? [selectedCandidate]
    : rankedCandidates.filter((candidate) => candidate.decision === "needs_review");

  for (const candidate of candidateWarnings) {
    for (const warning of candidate.warnings) {
      warnings.add(warning);
    }
  }

  const bestCandidate = rankedCandidates[0];
  const extractionCompleteness = computeExtractionCompleteness(extracted);
  const status: ProductResearchReport["status"] = bestCandidate
    ? bestCandidate.decision === "selected"
      ? extractionStatus === "success"
        ? "completed"
        : "needs_review"
      : "needs_review"
    : "needs_more_candidates";

  const report = {
    runId,
    status,
    generatedAt: now.toISOString(),
    input: resolvedInput,
    selectedCanonicalUrl: selectedCandidate?.normalizedUrl,
    productIdentity: {
      brand: {
        value: resolvedInput.brand,
        confidence: 1,
        sourceType: "input" as const,
        evidence: "Brand was supplied as part of the research request.",
      },
      registerName: {
        value: resolvedInput.registerName,
        confidence: 1,
        sourceType: "input" as const,
        evidence: "Register name was supplied as part of the research request.",
      },
      upc: {
        value: resolvedInput.upc,
        confidence: 1,
        sourceType: "input" as const,
        evidence: "UPC was supplied as part of the research request and used as the primary identity anchor.",
      },
      ...buildExtractedIdentityFields(extracted),
    },
    extracted,
    candidates: rankedCandidates,
    confidence: {
      overall: bestCandidate
        ? Math.max(0, Math.min(1, Number((bestCandidate.score * 0.75 + extractionCompleteness * 0.25).toFixed(4))))
        : 0,
      identityMatch: bestCandidate ? bestCandidate.relevanceScore : 0,
      variantMatch: bestCandidate ? bestCandidate.variantScore : 0,
      extractionCompleteness,
      sourceAuthority: bestCandidate ? bestCandidate.authorityScore : 0,
    },
    warnings: [...warnings],
    nextActions: buildNextActions(status, extractionStatus),
  };

  return productResearchReportSchema.parse(report);
}
