import type {
  CandidateUrlInput,
  EvaluatedCandidate,
  CandidateSourceType,
} from "../schemas/CandidateUrl";
import type {
  ProductResearchInput,
  ResolvedProductResearchInput,
} from "../schemas/ProductResearchInput";
import { getNormalizedUrlParts, isSameOrSubdomain, normalizeDomain } from "./url";
import { overlapScore, tokenizeText } from "./tokens";
import { normalizeBarcode } from "./barcode";

const SOURCE_TYPE_SCORES: Record<CandidateSourceType, number> = {
  input: 0.72,
  official: 1,
  sitemap: 0.88,
  serp: 0.66,
  distributor: 0.25,
  unknown: 0.5,
};

const PRODUCT_PATH_HINTS = [
  "product",
  "products",
  "recipe",
  "pate",
  "formula",
  "item",
  "dog-food",
  "cat-food",
  "wet-food",
  "dry-food",
];

const LOW_SIGNAL_PATH_HINTS = [
  "search",
  "blog",
  "blogs",
  "article",
  "articles",
  "faq",
  "support",
  "about",
  "contact",
  "cart",
  "account",
  "collection",
  "collections",
  "category",
  "categories",
];

const LOW_SIGNAL_SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "x.com",
  "twitter.com",
];

const LOW_SIGNAL_MARKETPLACE_DOMAINS = [
  "amazon.com",
  "ebay.com",
  "walmart.com",
  "homedepot.com",
  "business.walmart.com",
  "zoro.com",
];

const round = (value: number) => Number(value.toFixed(4));
const clamp = (value: number) => Math.max(0, Math.min(1, round(value)));

function resolveOfficialDomain(
  input: ProductResearchInput | ResolvedProductResearchInput,
): string | undefined {
  return normalizeDomain(
    "officialDomainResolved" in input
      ? input.officialDomainResolved ?? input.officialDomain ?? input.officialWebsiteUrl
      : input.officialDomain ?? input.officialWebsiteUrl,
  );
}

export function resolveInput(input: ProductResearchInput): ResolvedProductResearchInput {
  return {
    ...input,
    officialDomainResolved: resolveOfficialDomain(input),
  };
}

function buildIdentityTokens(
  input: ProductResearchInput | ResolvedProductResearchInput,
): string[] {
  return tokenizeText(input.brand, input.registerName, input.upc);
}

function buildVariantTokens(
  input: ProductResearchInput | ResolvedProductResearchInput,
): string[] {
  const brandTokens = new Set(tokenizeText(input.brand));
  const anchorTokens = new Set([...brandTokens, ...tokenizeText(input.upc)]);
  return tokenizeText(input.registerName).filter((token) => !anchorTokens.has(token));
}

function hasDomainSuffix(candidateDomain: string, domains: string[]) {
  return domains.some((domain) => candidateDomain === domain || candidateDomain.endsWith(`.${domain}`));
}

function scoreAuthority(candidateDomain: string, officialDomain: string | undefined, sourceType: CandidateSourceType): number {
  if (!officialDomain) {
    return SOURCE_TYPE_SCORES[sourceType];
  }

  if (isSameOrSubdomain(candidateDomain, officialDomain)) {
    return 1;
  }

  if (hasDomainSuffix(candidateDomain, LOW_SIGNAL_SOCIAL_DOMAINS)) {
    return 0.08;
  }

  if (sourceType === "distributor") {
    return 0.18;
  }

  if (hasDomainSuffix(candidateDomain, LOW_SIGNAL_MARKETPLACE_DOMAINS)) {
    return 0.16;
  }

  return 0.32;
}

function scorePath(
  path: string,
  candidateTextTokens: Iterable<string>,
  identityTokens: string[],
  officialDomainMatch: boolean,
): { score: number; warnings: string[] } {
  let score = path === "/" ? 0.12 : 0.45;
  const warnings: string[] = [];
  const lowerPath = path.toLowerCase();

  for (const hint of PRODUCT_PATH_HINTS) {
    if (lowerPath.includes(hint)) {
      score += 0.08;
    }
  }

  for (const hint of LOW_SIGNAL_PATH_HINTS) {
    if (lowerPath.includes(hint)) {
      score -= 0.18;
      warnings.push(`Path contains low-signal segment: ${hint}`);
    }
  }

  const pathOverlap = overlapScore(identityTokens, candidateTextTokens).score;
  score += Math.min(0.22, pathOverlap * 0.22);

  if (officialDomainMatch && path.split("/").filter(Boolean).length >= 2) {
    score += 0.08;
  }

  return {
    score: clamp(score),
    warnings,
  };
}

function buildDecisionReason(parts: string[]): string {
  return parts.slice(0, 3).join("; ");
}

export function evaluateCandidate(
  input: ProductResearchInput | ResolvedProductResearchInput,
  candidate: CandidateUrlInput,
): EvaluatedCandidate {
  const officialDomain = resolveOfficialDomain(input);
  const identityTokens = buildIdentityTokens(input);
  const variantTokens = buildVariantTokens(input);
  const { normalizedUrl, normalizedDomain, path } = getNormalizedUrlParts(candidate.url);

  const candidateTextTokens = tokenizeText(
    normalizedUrl,
    candidate.title,
    candidate.snippet,
    candidate.discoveredFrom,
  );

  const identityOverlap = overlapScore(identityTokens, candidateTextTokens);
  const variantOverlap = overlapScore(variantTokens, candidateTextTokens);
  const officialDomainMatch = isSameOrSubdomain(normalizedDomain, officialDomain);
  const authorityScore = scoreAuthority(normalizedDomain, officialDomain, candidate.sourceType);
  const sourceTypeScore = SOURCE_TYPE_SCORES[candidate.sourceType];
  const pathResult = scorePath(path, candidateTextTokens, identityTokens, officialDomainMatch);
  const isSocialDomain = hasDomainSuffix(normalizedDomain, LOW_SIGNAL_SOCIAL_DOMAINS);
  const isMarketplaceDomain = hasDomainSuffix(normalizedDomain, LOW_SIGNAL_MARKETPLACE_DOMAINS);

  let score =
    authorityScore * 0.4 +
    identityOverlap.score * 0.24 +
    variantOverlap.score * 0.16 +
    pathResult.score * 0.1 +
    sourceTypeScore * 0.1;

  const normalizedUpc = normalizeBarcode(input.upc) ?? input.upc;
  const upcInUrl = normalizedUrl.replace(/\D+/g, "").includes(normalizedUpc.replace(/\D+/g, ""));
  const upcInMetadata = [candidate.title, candidate.snippet, candidate.discoveredFrom].some((value) =>
    (value ?? "").replace(/\D+/g, "").includes(normalizedUpc.replace(/\D+/g, "")),
  );

  if (upcInUrl) {
    score += 0.12;
  }

  if (!upcInUrl && upcInMetadata) {
    score += 0.1;
  }

  if (candidate.title && tokenizeText(candidate.title).some((token) => identityTokens.includes(token))) {
    score += 0.05;
  }

  if (isSocialDomain) {
    score -= 0.18;
  }

  if (isMarketplaceDomain) {
    score -= 0.08;
  }

  if (officialDomain && !officialDomainMatch) {
    const offDomainCap = upcInUrl || upcInMetadata ? 0.72 : 0.64;
    score = Math.min(score, offDomainCap);
  }

  score = clamp(score);

  const reasons = [
    officialDomainMatch
      ? `Official-domain match: ${normalizedDomain}`
      : `Off-domain candidate: ${normalizedDomain}`,
    identityOverlap.matchedTokens.length > 0
      ? `Matched identity tokens: ${identityOverlap.matchedTokens.join(", ")}`
      : "No strong identity-token overlap",
    variantOverlap.matchedTokens.length > 0
      ? `Matched variant tokens: ${variantOverlap.matchedTokens.join(", ")}`
      : "No strong variant-token overlap",
    `Source type: ${candidate.sourceType}`,
    `Path score: ${pathResult.score.toFixed(2)}`,
  ];

  const warnings = [...pathResult.warnings];
  if (isSocialDomain) {
    warnings.push(`Candidate is on a low-signal social domain: ${normalizedDomain}`);
  }
  if (isMarketplaceDomain) {
    warnings.push(`Candidate is on a marketplace-like domain: ${normalizedDomain}`);
  }
  if (officialDomain && !officialDomainMatch) {
    warnings.push(`Candidate is outside official domain ${officialDomain}`);
  }

  return {
    ...candidate,
    normalizedUrl,
    normalizedDomain,
    matchedTokens: identityOverlap.matchedTokens,
    score,
    authorityScore: clamp(authorityScore),
    relevanceScore: clamp(identityOverlap.score),
    variantScore: clamp(variantOverlap.score),
    pathScore: clamp(pathResult.score),
    decision: "rejected",
    reason: buildDecisionReason(reasons),
    reasons,
    warnings,
  };
}

function markRejected(candidates: EvaluatedCandidate[]) {
  for (const candidate of candidates) {
    candidate.decision = "rejected";
    candidate.reason = candidate.reasons[0] ?? "Rejected during ranking";
  }
}

export function rankCandidates(
  input: ProductResearchInput | ResolvedProductResearchInput,
  candidates: CandidateUrlInput[],
): EvaluatedCandidate[] {
  const ranked = candidates
    .map((candidate) => evaluateCandidate(input, candidate))
    .sort((left, right) => right.score - left.score || right.authorityScore - left.authorityScore);

  if (ranked.length === 0) return ranked;

  markRejected(ranked);

  const [best, second] = ranked;
  const hasClearLead = !second || best.score - second.score >= 0.12;
  const strongOfficialLead = best.authorityScore >= 0.95 && best.score >= 0.62;
  const veryHighScore = best.score >= 0.74;

  if (hasClearLead && (veryHighScore || strongOfficialLead)) {
    best.decision = "selected";
    best.reason = `Selected as the strongest candidate (score ${best.score.toFixed(2)})`;
    return ranked;
  }

  best.decision = "needs_review";
  best.reason = `Top candidate is promising but not decisive (score ${best.score.toFixed(2)})`;

  if (second && Math.abs(best.score - second.score) <= 0.08) {
    second.decision = "needs_review";
    second.reason = `Near-tie candidate requires manual review (score ${second.score.toFixed(2)})`;
  }

  return ranked;
}

export function dedupeCandidates(candidates: CandidateUrlInput[]): CandidateUrlInput[] {
  const byUrl = new Map<string, CandidateUrlInput>();

  for (const candidate of candidates) {
    const normalizedUrl = getNormalizedUrlParts(candidate.url).normalizedUrl;
    const current = byUrl.get(normalizedUrl);

    if (!current) {
      byUrl.set(normalizedUrl, candidate);
      continue;
    }

    const currentScore = SOURCE_TYPE_SCORES[current.sourceType];
    const nextScore = SOURCE_TYPE_SCORES[candidate.sourceType];
    const preferred = nextScore > currentScore ? candidate : current;
    const fallback = preferred === candidate ? current : candidate;

    byUrl.set(normalizedUrl, {
      ...fallback,
      ...preferred,
      title: preferred.title ?? fallback.title,
      snippet: preferred.snippet ?? fallback.snippet,
      discoveredFrom: preferred.discoveredFrom ?? fallback.discoveredFrom,
    });
  }

  return [...byUrl.values()];
}
