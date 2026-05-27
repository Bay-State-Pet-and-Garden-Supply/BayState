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

function buildNextActions(
  status: ProductResearchReport["status"],
  extractionStatus: "success" | "unavailable" | "failed",
): string[] {
  const actions: string[] = [];

  if (status === "needs_more_candidates") {
    actions.push("Provide candidate URLs or add sitemap/SERP discovery adapters.");
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

  const candidates = dedupeCandidates(resolvedInput.candidateUrls);
  const rankedCandidates = rankCandidates(resolvedInput, candidates);
  const selectedCandidate = rankedCandidates.find((candidate) => candidate.decision === "selected");

  let extractionStatus: "success" | "unavailable" | "failed" = "unavailable";
  let extracted = extractedResearchFieldsSchema.parse({});
  const warnings = new Set<string>();

  if (!resolvedInput.officialDomainResolved) {
    warnings.add("Official domain is missing or could not be normalized.");
  }

  if (rankedCandidates.length === 0) {
    warnings.add("No candidate URLs were provided for scoring.");
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
      ...(resolvedInput.upc
        ? {
            upc: {
              value: resolvedInput.upc,
              confidence: 1,
              sourceType: "input" as const,
              evidence: "UPC was supplied as part of the research request.",
            },
          }
        : {}),
      ...(resolvedInput.expectedAttributes.size
        ? {
            size: {
              value: resolvedInput.expectedAttributes.size,
              confidence: 0.9,
              sourceType: "input" as const,
              evidence: "Expected size was provided with the product row.",
            },
          }
        : {}),
      ...(resolvedInput.expectedAttributes.flavor
        ? {
            flavor: {
              value: resolvedInput.expectedAttributes.flavor,
              confidence: 0.9,
              sourceType: "input" as const,
              evidence: "Expected flavor was provided with the product row.",
            },
          }
        : {}),
      ...(resolvedInput.expectedAttributes.variant
        ? {
            variant: {
              value: resolvedInput.expectedAttributes.variant,
              confidence: 0.9,
              sourceType: "input" as const,
              evidence: "Expected variant was provided with the product row.",
            },
          }
        : {}),
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
