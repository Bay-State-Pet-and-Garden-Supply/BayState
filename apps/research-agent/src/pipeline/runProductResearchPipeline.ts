import { dedupeCandidates, rankCandidates } from "../lib/candidate-scoring";
import { productResearchInputSchema } from "../schemas/ProductResearchInput";
import type { EvaluatedCandidate } from "../schemas/CandidateUrl";
import type { ExtractedResearchFields, ProductResearchReport } from "../schemas/ProductResearchReport";
import { productResearchReportSchema } from "../schemas/ProductResearchReport";
import type { ProductResearchPipelinePorts } from "./ports";
import type {
  ProductResearchPipelineResult,
  ProductResearchPipelineContext,
  CandidateUrlInput,
  PipelineWarning,
  VerificationResult,
  PageFactSet,
} from "./types";
import { mergePageFacts } from "./extraction/product-fact-extractor";

function createRunId(productId: string, now: Date) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `research-${timestamp}-${productId}`;
}

function computeExtractionCompleteness(extracted: ExtractedResearchFields): number {
  const checks = [
    Boolean(extracted.description),
    Boolean(extracted.images?.value?.length),
    Boolean(extracted.categories?.value?.length),
    Boolean(extracted.attributes && Object.keys(extracted.attributes.value).length > 0),
  ];
  return checks.filter(Boolean).length / checks.length;
}

function getEvidenceSourceType(facts: PageFactSet): "jsonld" | "meta" | "heuristic" {
  if (facts.jsonLd && facts.jsonLd.length > 0) return "jsonld";
  if (facts.evidenceSnippets.some(s => s.startsWith("meta["))) return "meta";
  return "heuristic";
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
    actions.push("Acquire pages and extract structured facts natively.");
  }

  if (actions.length === 0) {
    actions.push("Promote the stabilized report schema into packages/api before coordinator integration.");
  }

  return actions;
}

export async function runProductResearchPipeline(
  rawInput: unknown,
  ports: ProductResearchPipelinePorts,
  options?: { now?: Date; runId?: string; topN?: number; artifactRoot?: string },
): Promise<ProductResearchPipelineResult> {
  const parsedInput = productResearchInputSchema.parse(rawInput);
  const now = options?.now ?? new Date();
  const runId = options?.runId ?? createRunId(parsedInput.productId, now);
  const topN = options?.topN ?? 3;

  const context: ProductResearchPipelineContext = {
    now,
    runId,
    artifactRoot: options?.artifactRoot,
  };

  const warnings: PipelineWarning[] = [];

  // 1. Build Brief
  const brief = await ports.briefBuilder.buildBrief(parsedInput, context);

  if (!brief.resolvedInput.officialDomainResolved) {
    warnings.push({
      stage: "brief",
      message: "Official domain is missing or could not be normalized.",
    });
  }

  // 2. Discover Candidates
  const discoveryPromises = ports.discoveryProviders.map(provider =>
    provider.discoverCandidates(brief, context).catch(err => {
      warnings.push({
        stage: "discovery",
        message: `Discovery provider failed: ${err.message || String(err)}`,
      });
      return { candidates: [], warnings: [] };
    })
  );

  const discoveryResults = await Promise.all(discoveryPromises);
  const rawCandidates: CandidateUrlInput[] = [];
  for (const res of discoveryResults) {
    rawCandidates.push(...res.candidates);
    if (res.warnings) {
      warnings.push(...res.warnings);
    }
  }

  if (rawCandidates.length === 0) {
    warnings.push({
      stage: "discovery",
      message: "No candidate URLs were discovered.",
    });
  }

  // Deduplicate and rank candidates initially
  const dedupedCandidates = dedupeCandidates(rawCandidates);
  const rankedCandidates = rankCandidates(brief.resolvedInput, dedupedCandidates);

  // 3. Page Acquisition & Fact Extraction & Verification
  const verificationResults: VerificationResult[] = [];

  const candidatesToProcess = rankedCandidates.slice(0, topN);
  const otherCandidates = rankedCandidates.slice(topN);

  for (const candidate of candidatesToProcess) {
    try {
      const page = await ports.pageAcquisition.acquirePage(candidate.url, brief, context);
      if (page.html || page.text) {
        // Run all extractors
        const extractorPromises = ports.factExtractors.map(extractor =>
          extractor.extractFacts(page, brief, context).catch(err => {
            warnings.push({
              stage: "extraction",
              message: `Extractor failed for URL ${candidate.url}: ${err.message || String(err)}`,
              url: candidate.url,
            });
            return {
              sourceUrl: candidate.url,
              images: [],
              categories: [],
              attributes: {},
              evidenceSnippets: [],
              confidence: 0.0,
            } as PageFactSet;
          })
        );

        const factSets = await Promise.all(extractorPromises);
        const mergedFacts = mergePageFacts(factSets);

        const verification = await ports.verifier.verifyCandidate(candidate, mergedFacts, brief, context);
        verificationResults.push(verification);
      } else {
        // Acquisition returned page with no content
        warnings.push({
          stage: "acquisition",
          message: `Page acquisition returned empty content for URL: ${candidate.url}`,
          url: candidate.url,
        });
        const verification = await ports.verifier.verifyCandidate(candidate, undefined, brief, context);
        verificationResults.push(verification);
      }
    } catch (err: any) {
      warnings.push({
        stage: "acquisition",
        message: `Failed to acquire page for URL ${candidate.url}: ${err.message || String(err)}`,
        url: candidate.url,
      });
      const verification = await ports.verifier.verifyCandidate(candidate, undefined, brief, context);
      verificationResults.push(verification);
    }
  }

  // Handle remaining candidates
  for (const candidate of otherCandidates) {
    const verification = await ports.verifier.verifyCandidate(candidate, undefined, brief, context);
    verificationResults.push(verification);
  }

  // Update candidate evaluation fields based on verification results
  const finalCandidates: EvaluatedCandidate[] = verificationResults.map(res => {
    const cand = res.candidate;
    const finalScore = res.identityConfidence * 0.6 + res.variantConfidence * 0.4;
    
    let decision: EvaluatedCandidate["decision"] = "rejected";
    let reason = "Rejected based on verification scoring";
    if (res.identityConfidence >= 0.85 && res.variantConfidence >= 0.8) {
      decision = "selected";
      reason = `Selected via verification (identity: ${res.identityConfidence.toFixed(2)}, variant: ${res.variantConfidence.toFixed(2)})`;
    } else if (res.identityConfidence >= 0.5 && res.variantConfidence >= 0.5) {
      decision = "needs_review";
      reason = `Needs review (identity: ${res.identityConfidence.toFixed(2)}, variant: ${res.variantConfidence.toFixed(2)})`;
    }

    return {
      ...cand,
      score: finalScore,
      relevanceScore: res.identityConfidence,
      variantScore: res.variantConfidence,
      decision,
      reason,
      warnings: res.warnings.map(w => w.message),
    };
  });

  // Re-sort candidates based on new verification scores
  finalCandidates.sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore);

  // Guarantee at most one "selected" candidate
  let selectedFound = false;
  for (const cand of finalCandidates) {
    if (cand.decision === "selected") {
      if (selectedFound) {
        cand.decision = "needs_review";
        cand.reason = `Promising candidate but another selected first (score ${cand.score.toFixed(2)})`;
      } else {
        selectedFound = true;
      }
    }
  }

  // Extract selected fields from the top canonical page if one was selected
  const selectedCandidate = finalCandidates.find(c => c.decision === "selected");
  let extracted: ExtractedResearchFields = {};

  if (selectedCandidate) {
    const selectedResult = verificationResults.find(r => r.candidate.url === selectedCandidate.url);
    const facts = selectedResult?.facts;
    if (facts && facts.confidence > 0) {
      const srcType = getEvidenceSourceType(facts);
      extracted = {
        description: facts.description ? {
          value: facts.description,
          confidence: facts.confidence,
          sourceType: srcType,
          sourceUrl: facts.sourceUrl,
          evidence: facts.evidenceSnippets.join("\n"),
        } : undefined,
        images: facts.images.length > 0 ? {
          value: facts.images,
          confidence: facts.confidence,
          sourceType: srcType,
          sourceUrl: facts.sourceUrl,
          evidence: "Extracted from page content images.",
        } : undefined,
        categories: facts.categories.length > 0 ? {
          value: facts.categories,
          confidence: facts.confidence,
          sourceType: srcType,
          sourceUrl: facts.sourceUrl,
          evidence: "Extracted from page categories.",
        } : undefined,
        attributes: Object.keys(facts.attributes).length > 0 ? {
          value: facts.attributes,
          confidence: facts.confidence,
          sourceType: srcType,
          sourceUrl: facts.sourceUrl,
          evidence: "Extracted from page attributes.",
        } : undefined,
      };
    }
  }

  // Accumulate warnings from all verification results
  for (const res of verificationResults) {
    warnings.push(...res.warnings);
  }

  const extractionCompleteness = computeExtractionCompleteness(extracted);
  const bestCandidate = finalCandidates[0];
  const status: ProductResearchReport["status"] = bestCandidate
    ? (bestCandidate.decision === "selected" ? "completed" : "needs_review")
    : "needs_more_candidates";

  const overallConfidence = bestCandidate
    ? Math.max(0, Math.min(1, Number((bestCandidate.score * 0.75 + extractionCompleteness * 0.25).toFixed(4))))
    : 0;

  // Build identity evidences for the report
  const productIdentity: ProductResearchReport["productIdentity"] = {
    brand: {
      value: brief.resolvedInput.brand,
      confidence: 1,
      sourceType: "input",
      evidence: "Brand was supplied as part of the research request.",
    },
    registerName: {
      value: brief.resolvedInput.registerName,
      confidence: 1,
      sourceType: "input",
      evidence: "Register name was supplied as part of the research request.",
    },
  };

  if (brief.resolvedInput.upc) {
    productIdentity.upc = {
      value: brief.resolvedInput.upc,
      confidence: 1,
      sourceType: "input",
      evidence: "UPC was supplied as part of the research request.",
    };
  }
  if (brief.resolvedInput.expectedAttributes.size) {
    productIdentity.size = {
      value: brief.resolvedInput.expectedAttributes.size,
      confidence: 0.9,
      sourceType: "input",
      evidence: "Expected size was provided with the product row.",
    };
  }
  if (brief.resolvedInput.expectedAttributes.flavor) {
    productIdentity.flavor = {
      value: brief.resolvedInput.expectedAttributes.flavor,
      confidence: 0.9,
      sourceType: "input",
      evidence: "Expected flavor was provided with the product row.",
    };
  }
  if (brief.resolvedInput.expectedAttributes.variant) {
    productIdentity.variant = {
      value: brief.resolvedInput.expectedAttributes.variant,
      confidence: 0.9,
      sourceType: "input",
      evidence: "Expected variant was provided with the product row.",
    };
  }

  const report: ProductResearchReport = {
    runId,
    status,
    generatedAt: context.now.toISOString(),
    input: brief.resolvedInput,
    selectedCanonicalUrl: selectedCandidate?.normalizedUrl,
    productIdentity,
    extracted,
    candidates: finalCandidates,
    confidence: {
      overall: overallConfidence,
      identityMatch: bestCandidate ? bestCandidate.relevanceScore : 0,
      variantMatch: bestCandidate ? bestCandidate.variantScore : 0,
      extractionCompleteness,
      sourceAuthority: bestCandidate ? bestCandidate.authorityScore : 0,
    },
    warnings: [...new Set(warnings.map(w => w.message))],
    nextActions: buildNextActions(status, selectedCandidate ? "success" : "unavailable"),
  };

  // Compile final pipeline warnings into the return format
  const pipelineWarnings: PipelineWarning[] = warnings;

  // 4. Assemble Storefront Draft
  const storefrontProduct = await ports.assembler.assembleStorefrontProduct(report, context);

  let finalReport = productResearchReportSchema.parse(report);

  // 5. Optional Adjudicator
  if (ports.adjudicator) {
    finalReport = await ports.adjudicator.adjudicateCandidates(finalReport, context);
  }

  return {
    report: finalReport,
    storefrontProduct,
    warnings: pipelineWarnings,
  };
}
