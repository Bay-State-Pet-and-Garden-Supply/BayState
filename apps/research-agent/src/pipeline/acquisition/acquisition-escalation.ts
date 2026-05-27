import type { EvaluatedCandidate } from "../../schemas/CandidateUrl";
import type { ProductResearchBrief } from "../types";
import type { AcquiredPage, PageFactSet } from "../types";
import { overlapScore, tokenizeText } from "../../lib/tokens";
import { normalizeBarcode, normalizeBarcodes } from "../../lib/barcode";

const BLOCKED_PAGE_PATTERNS = [
  /just a moment/i,
  /attention required/i,
  /checking your browser/i,
  /access denied/i,
  /enable javascript/i,
  /captcha/i,
  /cloudflare/i,
  /verify you are human/i,
];

const NON_PRODUCT_ASSET_EXTENSIONS = /\.(?:pdf|xlsx?|csv|xml|json|jpg|jpeg|png|gif|webp|svg|zip)(?:$|[?#])/i;
const MAX_BROWSER_ESCALATIONS_PER_RUN = 2;

export interface AcquisitionEscalationDecision {
  shouldEscalate: boolean;
  reasons: string[];
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function candidateHasUpcHint(candidate: EvaluatedCandidate, brief: ProductResearchBrief) {
  const normalizedUpc = normalizeBarcode(brief.input.upc);
  if (!normalizedUpc) return false;
  return [candidate.url, candidate.title, candidate.snippet, candidate.discoveredFrom]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.replace(/\D+/g, "").includes(normalizedUpc));
}

function getDescriptorTokens(brief: ProductResearchBrief) {
  const brandTokens = new Set(tokenizeText(brief.input.brand, brief.input.upc));
  return tokenizeText(brief.input.registerName).filter((token) => !brandTokens.has(token));
}

function getFactBarcodes(facts: PageFactSet | undefined): string[] {
  if (!facts) return [];
  return normalizeBarcodes([
    facts.attributes.gtin as string | undefined,
    facts.attributes.gtin8 as string | undefined,
    facts.attributes.gtin12 as string | undefined,
    facts.attributes.gtin13 as string | undefined,
    facts.attributes.gtin14 as string | undefined,
    facts.attributes.sku as string | undefined,
    facts.attributes.mpn as string | undefined,
    ...(Array.isArray(facts.attributes.heuristicUpcs) ? facts.attributes.heuristicUpcs : []),
  ]);
}

export function pageContainsBlockedSignals(page: AcquiredPage | undefined): string[] {
  if (!page) return [];
  const haystack = [page.title, page.text?.slice(0, 1200), page.html?.slice(0, 2000)]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return BLOCKED_PAGE_PATTERNS
    .filter((pattern) => pattern.test(haystack))
    .map((pattern) => pattern.source);
}

export function isNonProductAssetUrl(url: string): boolean {
  return NON_PRODUCT_ASSET_EXTENSIONS.test(url);
}

export function isHighValueCandidate(candidate: EvaluatedCandidate, brief: ProductResearchBrief): boolean {
  return (
    candidate.sourceType === "official"
    || candidate.sourceType === "sitemap"
    || candidate.discoveredFrom?.startsWith("page-index:") === true
    || candidate.score >= 0.55
    || candidateHasUpcHint(candidate, brief)
  );
}

export function scoreAcquiredEvidence(
  page: AcquiredPage | undefined,
  facts: PageFactSet | undefined,
  brief: ProductResearchBrief,
): number {
  if (!page) return 0;

  let score = 0;
  if (!page.metadata?.error) score += 0.1;
  if ((page.statusCode ?? 0) >= 200 && (page.statusCode ?? 0) < 300) score += 0.1;
  if (page.title) score += 0.08;
  if ((page.text?.length ?? 0) > 250) score += 0.07;
  if (facts) {
    score += Math.min(0.35, facts.confidence * 0.35);
    if (facts.title) score += 0.1;
    if ((facts.description?.length ?? 0) > 40) score += 0.14;
    if (facts.images.length > 0) score += 0.08;
    if (facts.categories.length > 0) score += 0.03;
    if (Object.keys(facts.attributes).length > 0) score += 0.1;
  }

  const normalizedUpc = normalizeBarcode(brief.input.upc);
  if (normalizedUpc && getFactBarcodes(facts).includes(normalizedUpc)) {
    score += 0.22;
  }

  const descriptorTokens = getDescriptorTokens(brief);
  const actualTokens = tokenizeText(
    page.title,
    facts?.title,
    facts?.description,
    ...(facts?.categories ?? []),
  );
  const overlap = descriptorTokens.length > 0 ? overlapScore(descriptorTokens, actualTokens).score : 0;
  score += Math.min(0.12, overlap * 0.12);

  if (pageContainsBlockedSignals(page).length > 0) {
    score -= 0.45;
  }

  return clamp(score);
}

export function shouldEscalateToBrowser(
  candidate: EvaluatedCandidate,
  page: AcquiredPage | undefined,
  facts: PageFactSet | undefined,
  brief: ProductResearchBrief,
  state: { usedEscalations: number },
): AcquisitionEscalationDecision {
  const reasons: string[] = [];

  if (state.usedEscalations >= MAX_BROWSER_ESCALATIONS_PER_RUN) {
    return { shouldEscalate: false, reasons: ["browser escalation budget exhausted"] };
  }

  if (!isHighValueCandidate(candidate, brief)) {
    return { shouldEscalate: false, reasons: ["candidate not valuable enough for browser escalation"] };
  }

  if (isNonProductAssetUrl(candidate.url)) {
    return { shouldEscalate: false, reasons: ["candidate URL is a non-product asset"] };
  }

  const blockedSignals = pageContainsBlockedSignals(page);
  if (blockedSignals.length > 0) {
    reasons.push(`blocked-page-signal:${blockedSignals.join(",")}`);
  }

  if (!page || page.metadata?.error) {
    reasons.push("page-acquisition-error");
  }

  if ((page?.statusCode ?? 0) === 403 || (page?.statusCode ?? 0) === 429 || (page?.statusCode ?? 0) === 503 || (page?.statusCode ?? 0) === 599) {
    reasons.push(`status-${page?.statusCode}`);
  }

  if ((page?.html?.length ?? 0) < 200 && (page?.text?.length ?? 0) < 120) {
    const factsLookStrong = Boolean(
      facts
      && facts.confidence > 0.6
      && (facts.description || facts.images.length > 0 || Object.keys(facts.attributes).length > 0),
    );
    if (!factsLookStrong) {
      reasons.push("page-content-too-thin");
    }
  }

  if (!facts) {
    reasons.push("no-facts-extracted");
  } else {
    if (facts.confidence <= 0.35) {
      reasons.push(`low-fact-confidence:${facts.confidence.toFixed(2)}`);
    }
    if (!facts.description && facts.images.length === 0 && Object.keys(facts.attributes).length === 0) {
      reasons.push("facts-lack-core-fields");
    }

    const normalizedUpc = normalizeBarcode(brief.input.upc);
    if (normalizedUpc && !getFactBarcodes(facts).includes(normalizedUpc)) {
      reasons.push("upc-not-found-in-facts");
    }

    const descriptorTokens = getDescriptorTokens(brief);
    const actualTokens = tokenizeText(
      page?.title,
      facts.title,
      facts.description,
      ...facts.categories,
    );
    const overlap = descriptorTokens.length > 0 ? overlapScore(descriptorTokens, actualTokens).score : 1;
    if (overlap < 0.35) {
      reasons.push(`low-descriptor-overlap:${overlap.toFixed(2)}`);
    }
  }

  return {
    shouldEscalate: reasons.length > 0,
    reasons,
  };
}
