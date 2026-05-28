import { dedupeCandidates, rankCandidates } from "../lib/candidate-scoring";
import { productResearchInputSchema } from "../schemas/ProductResearchInput";
import type { EvaluatedCandidate } from "../schemas/CandidateUrl";
import type { AcquisitionDiagnostic, ExtractedResearchFields, ProductResearchReport } from "../schemas/ProductResearchReport";
import { productResearchReportSchema } from "../schemas/ProductResearchReport";
import type { ProductResearchPipelinePorts } from "./ports";
import type {
  ProductResearchPipelineResult,
  ProductResearchPipelineContext,
  CandidateUrlInput,
  PipelineWarning,
  VerificationResult,
  PageFactSet,
  ProductResearchBrief,
} from "./types";
import { mergePageFacts } from "./extraction/product-fact-extractor";
import { extractCandidateMetadataFacts } from "./extraction/candidate-metadata-extractor";
import { pageContainsBlockedSignals, scoreAcquiredEvidence, shouldEscalateToBrowser } from "./acquisition/acquisition-escalation";
import { isSameOrSubdomain } from "../lib/url";
import { normalizeBarcode } from "../lib/barcode";
import { tokenizeText } from "../lib/tokens";

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

function firstAttributeString(attributes: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      if (first) return first.trim();
    }
  }
  return undefined;
}

function buildExtractedIdentityFields(facts: PageFactSet | undefined): Partial<ProductResearchReport["productIdentity"]> {
  if (!facts || Object.keys(facts.attributes).length === 0) {
    return {};
  }

  const sourceType = getEvidenceSourceType(facts);
  const confidence = Math.max(0.5, Math.min(0.95, facts.confidence));
  const evidence = facts.evidenceSnippets.join("\n") || "Extracted from selected canonical page facts.";
  const toEvidence = (value: string) => ({
    value,
    confidence,
    sourceType,
    sourceUrl: facts.sourceUrl,
    evidence,
  });

  const size = firstAttributeString(facts.attributes, ["size", "weight", "netWeight", "heuristicSizes"]);
  const flavor = firstAttributeString(facts.attributes, ["flavor", "flavour"]);
  const variant = firstAttributeString(facts.attributes, ["variant", "formula", "style", "mpn"]);

  return {
    ...(size ? { size: toEvidence(size) } : {}),
    ...(flavor ? { flavor: toEvidence(flavor) } : {}),
    ...(variant ? { variant: toEvidence(variant) } : {}),
  };
}

async function extractFactsForPage(
  candidate: EvaluatedCandidate,
  page: PageFactExtractionPage | undefined,
  ports: ProductResearchPipelinePorts,
  brief: ProductResearchBrief,
  context: ProductResearchPipelineContext,
  warnings: PipelineWarning[],
): Promise<PageFactSet | undefined> {
  const factSets: PageFactSet[] = [extractCandidateMetadataFacts(candidate, brief)];

  if (page?.html || page?.text) {
    const extractorPromises = ports.factExtractors.map((extractor) =>
      extractor.extractFacts(page, brief, context).catch((err) => {
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
      }),
    );

    factSets.push(...(await Promise.all(extractorPromises)));
  }

  return factSets.length > 0 ? mergePageFacts(factSets) : undefined;
}

function isCandidateUnsafeForCanonicalSelection(candidate: EvaluatedCandidate, diagnostics?: AcquisitionDiagnostic): boolean {
  try {
    const parsed = new URL(candidate.normalizedUrl);
    const path = parsed.pathname.toLowerCase();
    const primaryBlocked = diagnostics?.primaryBlockedSignals?.length ?? 0;
    const fallbackBlocked = diagnostics?.fallbackBlockedSignals?.length ?? 0;
    const blockedByChosenEvidence = fallbackBlocked > 0 || (!diagnostics?.fallbackEngine && primaryBlocked > 0);

    return (
      /\.(?:pdf|xlsx?|csv|json|xml)(?:$|[?#])/i.test(candidate.normalizedUrl)
      || path === "/"
      || path.includes("/search")
      || path.includes("/collections/")
      || path.includes("/collection/")
      || path.includes("/category/")
      || path.includes("/reviews")
      || path.includes("/spotlight/")
      || path.includes("/incentive-requests/")
      || path.includes("/blog/")
      || path.includes("/blogs/")
      || blockedByChosenEvidence
    );
  } catch {
    return false;
  }
}

function hasHardMismatchWarnings(candidate: EvaluatedCandidate): boolean {
  return candidate.warnings.some((warning) => /Brand mismatch/i.test(warning));
}

function isSafeOfficialProductCandidate(
  candidate: EvaluatedCandidate,
  diagnostics: AcquisitionDiagnostic | undefined,
  officialDomain: string | undefined,
): boolean {
  return Boolean(
    officialDomain
    && isSameOrSubdomain(candidate.normalizedDomain, officialDomain)
    && !isCandidateUnsafeForCanonicalSelection(candidate, diagnostics)
    && candidate.pathScore >= 0.6
    && candidate.relevanceScore >= 0.8
    && !hasHardMismatchWarnings(candidate),
  );
}

function isPromotableOfficialCanonicalCandidate(
  candidate: EvaluatedCandidate,
  diagnostics: AcquisitionDiagnostic | undefined,
  brief: ProductResearchBrief,
): boolean {
  const officialDomain = brief.resolvedInput.officialDomainResolved;
  const minimumIdentity = brief.constraints.preferOfficialSource ? 0.8 : 0.85;
  const minimumVariant = brief.constraints.preferOfficialSource ? 0.65 : 0.7;
  const hasVerifiedEvidence = Boolean(
    diagnostics
    && (diagnostics.selectedEvidenceScore ?? 0) >= 0.35
    && (diagnostics.finalFactConfidence ?? diagnostics.factConfidence ?? 0) >= 0.2
    && !diagnostics.error,
  );

  return Boolean(
    hasVerifiedEvidence
    && isSafeOfficialProductCandidate(candidate, diagnostics, officialDomain)
    && candidate.relevanceScore >= minimumIdentity
    && candidate.variantScore >= minimumVariant,
  );
}

function compareOfficialCanonicalCandidates(left: EvaluatedCandidate, right: EvaluatedCandidate): number {
  return (
    right.score - left.score
    || right.relevanceScore - left.relevanceScore
    || right.variantScore - left.variantScore
    || right.pathScore - left.pathScore
    || right.authorityScore - left.authorityScore
  );
}

function decisionPriority(candidate: EvaluatedCandidate): number {
  switch (candidate.decision) {
    case "selected":
      return 3;
    case "needs_review":
      return 2;
    default:
      return 1;
  }
}

function candidateHasUpcHint(candidate: EvaluatedCandidate, upc: string): boolean {
  const normalizedUpc = normalizeBarcode(upc);
  if (!normalizedUpc) return false;
  return [candidate.url, candidate.title, candidate.snippet, candidate.discoveredFrom]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.replace(/\D+/g, "").includes(normalizedUpc));
}

function extractProductCodeHintsFromCandidates(
  rankedCandidates: EvaluatedCandidate[],
  brief: ProductResearchBrief,
): string[] {
  const brandTokens = tokenizeText(brief.input.brand).filter((token) => token.length >= 3);
  const brandSequencePattern = brandTokens.length >= 2
    ? new RegExp(`\\b${brandTokens.map((token) => token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("\\W+")}\\W+(\\d{2,6})\\b`, "i")
    : undefined;
  const hints = new Set<string>();

  const addFromText = (value: string | undefined) => {
    if (!value) return;

    for (const match of value.matchAll(/\bitem[-\s#:]?(\d{2,6})\b/gi)) {
      hints.add(match[1]!);
    }

    for (const match of value.matchAll(/\b(?:sku|model|seed)[-\s#:]?(\d{2,6})\b/gi)) {
      hints.add(match[1]!);
    }

    const brandSequenceMatch = brandSequencePattern?.exec(value);
    if (brandSequenceMatch?.[1]) {
      hints.add(brandSequenceMatch[1]);
    }
  };

  for (const candidate of rankedCandidates) {
    if (candidate.sourceType === "official") continue;
    if (!candidateHasUpcHint(candidate, brief.input.upc)) continue;

    addFromText(candidate.url);
    addFromText(candidate.title);
    addFromText(candidate.snippet);
    addFromText(candidate.discoveredFrom);
  }

  const normalizedUpc = normalizeBarcode(brief.input.upc) ?? "";
  return [...hints]
    .filter((code) => code.length >= 2 && code.length <= 6)
    .filter((code) => code !== normalizedUpc)
    .slice(0, 3);
}

function buildCandidateProcessingQueue(
  rankedCandidates: EvaluatedCandidate[],
  topN: number,
  brief: ProductResearchBrief,
): EvaluatedCandidate[] {
  const queue: EvaluatedCandidate[] = [];
  const seen = new Set<string>();
  const budget = Math.min(Math.max(topN, 4), 5);
  const officialDomain = brief.resolvedInput.officialDomainResolved;
  const productCodeHints = extractProductCodeHintsFromCandidates(rankedCandidates, brief);

  const add = (candidate: EvaluatedCandidate | undefined) => {
    if (!candidate || seen.has(candidate.normalizedUrl)) return;
    seen.add(candidate.normalizedUrl);
    queue.push(candidate);
  };

  add(rankedCandidates.find((candidate) =>
    !isCandidateUnsafeForCanonicalSelection(candidate)
    && Boolean(
      productCodeHints.length > 0
      && (officialDomain ? isSameOrSubdomain(candidate.normalizedDomain, officialDomain) : candidate.sourceType === "official")
      && productCodeHints.some((code) => tokenizeText(candidate.url, candidate.title).includes(code))
    )
  ));

  add(rankedCandidates.find((candidate) =>
    !isCandidateUnsafeForCanonicalSelection(candidate)
    && (
      candidate.discoveredFrom?.startsWith("page-index:")
      || (officialDomain ? isSameOrSubdomain(candidate.normalizedDomain, officialDomain) : candidate.sourceType === "official")
    )
  ));

  add(rankedCandidates.find((candidate) => candidate.discoveredFrom === "page-index:exact-upc"));

  add(rankedCandidates.find((candidate) =>
    candidateHasUpcHint(candidate, brief.input.upc)
    && !(officialDomain && isSameOrSubdomain(candidate.normalizedDomain, officialDomain))
  ));

  add(rankedCandidates.find((candidate) =>
    !isCandidateUnsafeForCanonicalSelection(candidate)
    && candidate.sourceType === "official"
    && candidate.discoveredFrom?.startsWith("serper:")
  ));

  add(rankedCandidates.find((candidate) =>
    (candidate.sourceType === "distributor" || candidate.sourceType === "serp")
    && Boolean(candidate.snippet && candidate.snippet.length >= 45)
  ));

  for (const candidate of rankedCandidates) {
    add(candidate);
    if (queue.length >= budget) break;
  }

  return queue.slice(0, budget);
}

type PageFactExtractionPage = {
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
};

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

  // 2. Discover Candidates (sequentially to allow early breakout on cache hits)
  const rawCandidates: CandidateUrlInput[] = [];
  for (const provider of ports.discoveryProviders) {
    try {
      const res = await provider.discoverCandidates(brief, context);
      if (res.candidates) {
        rawCandidates.push(...res.candidates);
      }
      if (res.warnings) {
        warnings.push(...res.warnings);
      }

      // Short-circuit if we found an exact UPC match in the local cache
      const hasExactMatch = rawCandidates.some(c => c.discoveredFrom === "page-index:exact-upc");
      if (hasExactMatch) {
        break;
      }
    } catch (err: any) {
      warnings.push({
        stage: "discovery",
        message: `Discovery provider failed: ${err.message || String(err)}`,
      });
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
  const candidateDiagnostics: AcquisitionDiagnostic[] = [];

  const candidatesToProcess = buildCandidateProcessingQueue(rankedCandidates, topN, brief);
  const processedCandidateUrls = new Set(candidatesToProcess.map((candidate) => candidate.url));

  let browserEscalationsUsed = 0;
  const escalatedUrls = new Set<string>();
  const blockedBrowserDomains = new Set<string>();

  for (const candidate of candidatesToProcess) {
    const diagnostic: AcquisitionDiagnostic = {
      url: candidate.normalizedUrl,
      sourceType: candidate.sourceType,
      discoveredFrom: candidate.discoveredFrom,
      initialScore: candidate.score,
    };

    try {
      let page = await ports.pageAcquisition.acquirePage(candidate.url, brief, context);
      let facts = await extractFactsForPage(candidate, page, ports, brief, context, warnings);
      let evidenceScore = scoreAcquiredEvidence(page, facts, brief);

      diagnostic.primaryEngine = typeof page.metadata?.engine === "string" ? page.metadata.engine : "unknown";
      diagnostic.primaryStatusCode = page.statusCode;
      diagnostic.primaryTitle = page.title;
      diagnostic.primaryTextLength = page.text?.length ?? 0;
      diagnostic.primaryEvidenceScore = evidenceScore;
      diagnostic.primaryBlockedSignals = pageContainsBlockedSignals(page);
      diagnostic.factConfidence = facts?.confidence ?? 0;

      if (!(page.html || page.text)) {
        warnings.push({
          stage: "acquisition",
          message: `Page acquisition returned empty content for URL: ${candidate.url}`,
          url: candidate.url,
        });
      }

      if (
        ports.fallbackPageAcquisition
        && !escalatedUrls.has(candidate.url)
        && !blockedBrowserDomains.has(candidate.normalizedDomain)
      ) {
        const escalation = shouldEscalateToBrowser(candidate, page, facts, brief, {
          usedEscalations: browserEscalationsUsed,
        });

        if (escalation.shouldEscalate) {
          escalatedUrls.add(candidate.url);
          browserEscalationsUsed += 1;
          diagnostic.escalationReasons = escalation.reasons;
          warnings.push({
            stage: "acquisition",
            message: `Escalating to browser-backed acquisition for URL ${candidate.url}: ${escalation.reasons.join(", ")}`,
            url: candidate.url,
          });

          try {
            const primaryEvidenceScore = evidenceScore;
            const fallbackPage = await ports.fallbackPageAcquisition.acquirePage(candidate.url, brief, context);
            const fallbackFacts = await extractFactsForPage(candidate, fallbackPage, ports, brief, context, warnings);
            const fallbackEvidenceScore = scoreAcquiredEvidence(fallbackPage, fallbackFacts, brief);
            const fallbackBlockedSignals = pageContainsBlockedSignals(fallbackPage);

            diagnostic.fallbackEngine = typeof fallbackPage.metadata?.engine === "string" ? fallbackPage.metadata.engine : "unknown";
            diagnostic.fallbackStatusCode = fallbackPage.statusCode;
            diagnostic.fallbackTitle = fallbackPage.title;
            diagnostic.fallbackTextLength = fallbackPage.text?.length ?? 0;
            diagnostic.fallbackEvidenceScore = fallbackEvidenceScore;
            diagnostic.fallbackBlockedSignals = fallbackBlockedSignals;

            if (fallbackBlockedSignals.length > 0) {
              blockedBrowserDomains.add(candidate.normalizedDomain);
              warnings.push({
                stage: "acquisition",
                message: `Browser-backed acquisition remained blocked for URL ${candidate.url}: ${fallbackBlockedSignals.join(", ")}`,
                url: candidate.url,
              });
            } else if (fallbackEvidenceScore > primaryEvidenceScore + 0.05) {
              page = fallbackPage;
              facts = fallbackFacts;
              evidenceScore = fallbackEvidenceScore;
              warnings.push({
                stage: "acquisition",
                message: `Browser-backed acquisition improved evidence for URL ${candidate.url} (score ${fallbackEvidenceScore.toFixed(2)} > ${primaryEvidenceScore.toFixed(2)}).`,
                url: candidate.url,
              });
            } else {
              warnings.push({
                stage: "acquisition",
                message: `Browser-backed acquisition did not materially improve evidence for URL ${candidate.url}.`,
                url: candidate.url,
              });
            }
          } catch (fallbackError: any) {
            warnings.push({
              stage: "acquisition",
              message: `Browser-backed acquisition failed for URL ${candidate.url}: ${fallbackError?.message || String(fallbackError)}`,
              url: candidate.url,
            });
          }
        }
      }

      diagnostic.selectedEvidenceScore = evidenceScore;
      diagnostic.finalFactConfidence = facts?.confidence ?? 0;
      candidateDiagnostics.push(diagnostic);

      const verification = await ports.verifier.verifyCandidate(candidate, facts, brief, context);
      verificationResults.push(verification);
    } catch (err: any) {
      warnings.push({
        stage: "acquisition",
        message: `Failed to acquire page for URL ${candidate.url}: ${err.message || String(err)}`,
        url: candidate.url,
      });
      diagnostic.error = err?.message || String(err);
      candidateDiagnostics.push(diagnostic);
      const verification = await ports.verifier.verifyCandidate(candidate, extractCandidateMetadataFacts(candidate, brief), brief, context);
      verificationResults.push(verification);
    }
  }

  const officialDomain = brief.resolvedInput.officialDomainResolved;

  // Update candidate evaluation fields based on verification results
  const verifiedCandidates: EvaluatedCandidate[] = verificationResults.map((res) => {
    const cand = res.candidate;
    const finalScore = res.identityConfidence * 0.6 + res.variantConfidence * 0.4;
    const mergedWarnings = [...cand.warnings, ...res.warnings.map((w) => w.message)];
    const provisionalCandidate: EvaluatedCandidate = {
      ...cand,
      score: finalScore,
      relevanceScore: res.identityConfidence,
      variantScore: res.variantConfidence,
      decision: "rejected",
      reason: "Rejected based on verification scoring",
      warnings: mergedWarnings,
    };

    const safeOfficialCandidate = isSafeOfficialProductCandidate(provisionalCandidate, undefined, officialDomain);
    const hasHardMismatch = mergedWarnings.some((warning) => /Brand mismatch/i.test(warning));
    const hasSoftMismatch = mergedWarnings.some((warning) => /Low title overlap|Low register-name descriptor overlap/i.test(warning));

    let decision: EvaluatedCandidate["decision"] = "rejected";
    let reason = "Rejected based on verification scoring";
    if (res.identityConfidence >= 0.85 && (res.variantConfidence >= 0.8 || (safeOfficialCandidate && res.variantConfidence >= 0.7))) {
      if (hasHardMismatch || (hasSoftMismatch && !safeOfficialCandidate)) {
        decision = "needs_review";
        reason = "Strong match needs review because extracted evidence still shows hard mismatch warnings.";
      } else {
        decision = "selected";
        reason = `Selected via verification (identity: ${res.identityConfidence.toFixed(2)}, variant: ${res.variantConfidence.toFixed(2)})`;
      }
    } else if (res.identityConfidence >= 0.5 && res.variantConfidence >= 0.5) {
      decision = "needs_review";
      reason = `Needs review (identity: ${res.identityConfidence.toFixed(2)}, variant: ${res.variantConfidence.toFixed(2)})`;
    }

    return {
      ...provisionalCandidate,
      decision,
      reason,
    };
  });

  const unprocessedCandidates: EvaluatedCandidate[] = rankedCandidates
    .filter((candidate) => !processedCandidateUrls.has(candidate.url))
    .map((candidate) => ({
      ...candidate,
      decision: candidate.decision === "selected" ? "needs_review" : candidate.decision,
      reason: candidate.decision === "selected"
        ? `Promising candidate but not acquired due to acquisition budget (initial score ${candidate.score.toFixed(2)})`
        : `${candidate.reason} (not acquired due to acquisition budget)`,
      warnings: [...candidate.warnings, "Candidate was not acquired due to acquisition budget."],
    }));

  const finalCandidates: EvaluatedCandidate[] = [...verifiedCandidates, ...unprocessedCandidates];

  const diagnosticsByUrl = new Map(candidateDiagnostics.map((diagnostic) => [diagnostic.url, diagnostic]));
  const safeOfficialCandidates = finalCandidates.filter((candidate) =>
    isSafeOfficialProductCandidate(candidate, diagnosticsByUrl.get(candidate.normalizedUrl), officialDomain),
  );
  const pickPromotableOfficialCandidate = (excludeNormalizedUrl?: string) => safeOfficialCandidates
    .filter((candidate) =>
      candidate.normalizedUrl !== excludeNormalizedUrl
      && isPromotableOfficialCanonicalCandidate(candidate, diagnosticsByUrl.get(candidate.normalizedUrl), brief),
    )
    .sort(compareOfficialCanonicalCandidates)[0];

  // Prevent unsafe auto-selection and allow one winner.
  let selectedFound = false;
  for (const cand of finalCandidates) {
    if (cand.decision === "selected") {
      const diagnostics = diagnosticsByUrl.get(cand.normalizedUrl);
      if (isCandidateUnsafeForCanonicalSelection(cand, diagnostics)) {
        cand.decision = "needs_review";
        cand.reason = `Strong evidence exists but the URL is not safe for automatic canonical selection (${cand.normalizedUrl})`;
        cand.warnings = [...cand.warnings, "Automatic canonical selection was blocked for a homepage/search/asset or challenge-protected URL."];
        continue;
      }

      if (selectedFound) {
        cand.decision = "needs_review";
        cand.reason = `Promising candidate but another selected first (score ${cand.score.toFixed(2)})`;
      } else {
        selectedFound = true;
      }
    }
  }

  let selectedCandidate = finalCandidates.find((candidate) => candidate.decision === "selected");

  // If an off-domain corroborating candidate won, try to promote a safe official product candidate.
  const selectedOffDomainCandidate = officialDomain && selectedCandidate && !isSameOrSubdomain(selectedCandidate.normalizedDomain, officialDomain)
    ? selectedCandidate
    : undefined;

  if (selectedOffDomainCandidate) {
    const officialPromotionCandidate = pickPromotableOfficialCandidate(selectedOffDomainCandidate.normalizedUrl);

    if (officialPromotionCandidate) {
      officialPromotionCandidate.decision = "selected";
      officialPromotionCandidate.reason = brief.constraints.preferOfficialSource
        ? `Promoted safe official product page over off-domain corroborating candidate (official score ${officialPromotionCandidate.score.toFixed(2)}, corroborating score ${selectedOffDomainCandidate.score.toFixed(2)}).`
        : `Promoted official-domain candidate over off-domain corroborating candidate (official score ${officialPromotionCandidate.score.toFixed(2)}, corroborating score ${selectedOffDomainCandidate.score.toFixed(2)}).`;
      selectedOffDomainCandidate.decision = "needs_review";
      selectedOffDomainCandidate.reason = brief.constraints.preferOfficialSource
        ? "Strong off-domain evidence was retained for review as corroboration, but the safe official product page was preferred for canonical selection."
        : "Strong corroborating off-domain candidate retained for review, but official-domain candidate was promoted for canonical selection.";
      selectedCandidate = officialPromotionCandidate;
    }
  }

  // If nobody is selected yet, allow a safe official product candidate to win with slightly lower thresholds.
  if (!selectedCandidate) {
    const promotableOfficial = pickPromotableOfficialCandidate();
    if (promotableOfficial) {
      promotableOfficial.decision = "selected";
      promotableOfficial.reason = `Selected as safe official product candidate despite missing UPC/brand fields on-page (identity ${promotableOfficial.relevanceScore.toFixed(2)}, variant ${promotableOfficial.variantScore.toFixed(2)}).`;
      selectedCandidate = promotableOfficial;
    }
  }

  // Final ordering prefers selected/safe candidates over rejected unsafe ones when scores are close.
  finalCandidates.sort((a, b) => {
    const decisionDelta = decisionPriority(b) - decisionPriority(a);
    if (decisionDelta !== 0) return decisionDelta;
    const safeOfficialDelta = Number(isSafeOfficialProductCandidate(b, diagnosticsByUrl.get(b.normalizedUrl), officialDomain))
      - Number(isSafeOfficialProductCandidate(a, diagnosticsByUrl.get(a.normalizedUrl), officialDomain));
    if (safeOfficialDelta !== 0) return safeOfficialDelta;
    return b.score - a.score || b.authorityScore - a.authorityScore;
  });

  // Extract fields from the best verified page, even if it still needs review.
  const extractedSourceCandidate = selectedCandidate
    ?? safeOfficialCandidates.find((candidate) => candidate.decision !== "rejected")
    ?? finalCandidates.find((candidate) => candidate.decision === "needs_review");
  let extracted: ExtractedResearchFields = {};
  let selectedFacts: PageFactSet | undefined;

  if (extractedSourceCandidate) {
    const selectedResult = verificationResults.find(r => r.candidate.url === extractedSourceCandidate.url);
    const facts = selectedResult?.facts;
    if (facts && facts.confidence > 0) {
      selectedFacts = facts;
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
  const canonicalBestCandidate = selectedCandidate
    ?? safeOfficialCandidates.find((candidate) => candidate.decision !== "rejected")
    ?? finalCandidates.find((candidate) => !isCandidateUnsafeForCanonicalSelection(candidate, diagnosticsByUrl.get(candidate.normalizedUrl)))
    ?? finalCandidates[0];
  const status: ProductResearchReport["status"] = selectedCandidate
    ? "completed"
    : canonicalBestCandidate
      ? "needs_review"
      : "needs_more_candidates";

  const overallConfidence = canonicalBestCandidate
    ? Math.max(0, Math.min(1, Number((canonicalBestCandidate.score * 0.75 + extractionCompleteness * 0.25).toFixed(4))))
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
    upc: {
      value: brief.resolvedInput.upc,
      confidence: 1,
      sourceType: "input",
      evidence: "UPC was supplied as part of the research request and used as the primary identity anchor.",
    },
    ...buildExtractedIdentityFields(selectedFacts),
  };

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
      identityMatch: canonicalBestCandidate ? canonicalBestCandidate.relevanceScore : 0,
      variantMatch: canonicalBestCandidate ? canonicalBestCandidate.variantScore : 0,
      extractionCompleteness,
      sourceAuthority: canonicalBestCandidate ? canonicalBestCandidate.authorityScore : 0,
    },
    warnings: [...new Set(warnings.map(w => w.message))],
    nextActions: buildNextActions(status, selectedCandidate ? "success" : "unavailable"),
    diagnostics: {
      candidateAcquisition: candidateDiagnostics,
    },
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
