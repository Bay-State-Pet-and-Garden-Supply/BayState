import type { CandidateDiscoveryProvider } from "../ports";
import type {
  CandidateUrlInput,
  DiscoveryResult,
  PipelineWarning,
  ProductResearchBrief,
  ProductResearchPipelineContext,
} from "../types";
import { tokenizeText } from "../../lib/tokens";
import { isSameOrSubdomain, normalizeDomain } from "../../lib/url";

export interface SerperCandidateDiscoveryOptions {
  apiKey?: string;
  endpoint?: string;
  resultLimit?: number;
  fetchImpl?: typeof fetch;
  gl?: string;
  hl?: string;
  location?: string;
}

export interface SerperDiscoveryTrace {
  queries: string[];
  skuDiscoveryQuery: string;
  predictedName: string;
  officialDomainQuery?: string;
  skuDiscoveryCandidateCount: number;
  officialDomainCandidateCount: number;
}

export interface SerperDiscoveryResult extends DiscoveryResult {
  trace: SerperDiscoveryTrace;
}

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
};

type SerperResponse = {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: {
    title?: string;
    website?: string;
    description?: string;
  };
};

type SearchNameCandidate = {
  name: string;
  title?: string;
  link?: string;
  snippet?: string;
};

const TITLE_SEGMENT_SPLIT_RE = /\s+(?:\||–|—|-|::)\s+/g;
const SIZE_FRAGMENT_RE = /\b\d+(?:\/\d+)?(?:\.\d+)?\s?(?:oz|lb|lbs|g|kg|ml|gal|ct)\b/gi;
const GENERIC_TITLE_PATTERNS = [
  /\b(home|homepage|search|results?|catalog|collections?|categories?|brands?|shop|store|products?)\b/i,
  /\b(sign\s*in|account|cart|wishlist|newsletter)\b/i,
];

function cleanSearchText(value: string | undefined) {
  return (value ?? "")
    .replaceAll('"', " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteSearchTerm(value: string) {
  return `"${cleanSearchText(value)}"`;
}

function buildSkuDiscoveryQuery(brief: ProductResearchBrief) {
  return quoteSearchTerm(brief.input.upc);
}

function buildOfficialDomainQuery(brief: ProductResearchBrief, predictedName: string) {
  const domain = normalizeDomain(brief.resolvedInput.officialDomainResolved);
  const cleanName = cleanSearchText(predictedName);

  if (!domain || !cleanName) {
    return undefined;
  }

  return `site:${domain} ${cleanName}`;
}

function extractProductCodeHints(brief: ProductResearchBrief, payload: SerperResponse): string[] {
  const brandTokens = tokenizeText(brief.input.brand).filter((token) => token.length >= 3);
  const brandSequencePattern = brandTokens.length >= 2
    ? new RegExp(`\\b${brandTokens.map((token) => token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("\\W+")}\\W+(\\d{2,6})\\b`, "i")
    : undefined;
  const candidates = new Set<string>();

  const addFromText = (value: string | undefined) => {
    const text = cleanSearchText(value);
    if (!text) return;

    for (const match of text.matchAll(/\bitem[-\s#:]?(\d{2,6})\b/gi)) {
      candidates.add(match[1]!);
    }

    for (const match of text.matchAll(/\b(?:sku|model|seed)[-\s#:]?(\d{2,6})\b/gi)) {
      candidates.add(match[1]!);
    }

    const brandSequenceMatch = brandSequencePattern?.exec(text);
    if (brandSequenceMatch?.[1]) {
      candidates.add(brandSequenceMatch[1]);
    }
  };

  addFromText(payload.knowledgeGraph?.title);
  addFromText(payload.knowledgeGraph?.description);
  addFromText(payload.knowledgeGraph?.website);

  for (const result of payload.organic ?? []) {
    addFromText(result.title);
    addFromText(result.snippet);
    addFromText(result.link);
  }

  const normalizedUpc = cleanSearchText(brief.input.upc).replace(/\D+/g, "");
  return [...candidates]
    .filter((code) => code.length >= 2 && code.length <= 6)
    .filter((code) => code !== normalizedUpc)
    .slice(0, 3);
}

function buildOfficialCodeQuery(brief: ProductResearchBrief, productCode: string) {
  const domain = normalizeDomain(brief.resolvedInput.officialDomainResolved);
  if (!domain || !productCode) {
    return undefined;
  }

  return `site:${domain} "item-${productCode}"`;
}

function extractTitleSegments(title: string | undefined): string[] {
  const cleaned = cleanSearchText(title);
  if (!cleaned) {
    return [];
  }

  return [...new Set(
    cleaned
      .split(TITLE_SEGMENT_SPLIT_RE)
      .map((segment) => segment.trim())
      .filter(Boolean),
  )];
}

function normalizeComparableToken(token: string) {
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function looselyMatchesToken(left: string, right: string) {
  const normalizedLeft = normalizeComparableToken(left);
  const normalizedRight = normalizeComparableToken(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (
    normalizedLeft.length >= 4
    && normalizedRight.length >= 4
    && (normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft))
  ) {
    return true;
  }

  return false;
}

function looseOverlapScore(expected: string[], actual: string[]) {
  if (!expected.length || !actual.length) {
    return 0;
  }

  const matched = expected.filter((token) => actual.some((candidateToken) => looselyMatchesToken(token, candidateToken)));
  return matched.length / expected.length;
}

function buildRegisterDescriptorTokens(brief: ProductResearchBrief) {
  const brandTokens = new Set(tokenizeText(brief.input.brand));
  const upcTokens = new Set(tokenizeText(brief.input.upc));

  return tokenizeText(brief.input.registerName).filter((token) => !brandTokens.has(token) && !upcTokens.has(token));
}

function looksGenericTitle(value: string) {
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

function mergePredictedNameWithRegister(predictedName: string, registerName: string) {
  const cleanedPredictedName = cleanSearchText(predictedName);
  if (!cleanedPredictedName) {
    return cleanSearchText(registerName);
  }

  const normalizedPredictedName = cleanedPredictedName.toLowerCase().replace(/\s+/g, "");
  const missingSizeFragments = (cleanSearchText(registerName).match(SIZE_FRAGMENT_RE) ?? [])
    .map((fragment) => fragment.trim())
    .filter((fragment) => !normalizedPredictedName.includes(fragment.toLowerCase().replace(/\s+/g, "")));

  return cleanSearchText([cleanedPredictedName, ...missingSizeFragments].join(" "));
}

function selectPredictedName(brief: ProductResearchBrief, payload: SerperResponse) {
  const registerName = cleanSearchText(brief.input.registerName);
  const registerTokens = tokenizeText(registerName);
  const descriptorTokens = buildRegisterDescriptorTokens(brief);
  const brandTokens = tokenizeText(brief.input.brand);
  const candidatesByName = new Map<string, SearchNameCandidate>();

  const addCandidates = (title: string | undefined, evidence: Omit<SearchNameCandidate, "name">) => {
    for (const segment of extractTitleSegments(title)) {
      const key = segment.toLowerCase();
      if (!candidatesByName.has(key)) {
        candidatesByName.set(key, { name: segment, ...evidence });
      }
    }
  };

  addCandidates(payload.knowledgeGraph?.title, {
    title: payload.knowledgeGraph?.title,
    link: payload.knowledgeGraph?.website,
    snippet: payload.knowledgeGraph?.description,
  });

  for (const result of payload.organic ?? []) {
    addCandidates(result.title, result);
  }

  const scoredCandidates = [...candidatesByName.values()]
    .map((candidate) => {
      const candidateTokens = tokenizeText(candidate.name);
      const descriptorOverlap = looseOverlapScore(descriptorTokens, candidateTokens);
      const registerOverlap = looseOverlapScore(registerTokens, candidateTokens);
      const brandOverlap = looseOverlapScore(brandTokens, candidateTokens);
      const evidenceText = cleanSearchText([
        candidate.title,
        candidate.snippet,
        candidate.link,
      ].filter(Boolean).join(" "));
      const hasUpcEvidence = evidenceText.includes(cleanSearchText(brief.input.upc));
      const isOfficialDomainCandidate = candidate.link
        ? isSameOrSubdomain(candidate.link, brief.resolvedInput.officialDomainResolved)
        : false;

      let score = descriptorOverlap * 0.7 + registerOverlap * 0.15 + brandOverlap * 0.05;
      if (hasUpcEvidence) {
        score += 0.2;
      }
      if (isOfficialDomainCandidate) {
        score += 0.1;
      }
      if (looksGenericTitle(candidate.name)) {
        score -= 0.35;
      }
      if (candidateTokens.length < 3) {
        score -= 0.15;
      }

      return {
        ...candidate,
        descriptorOverlap,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  const bestCandidate = scoredCandidates[0];
  if (!bestCandidate || bestCandidate.descriptorOverlap < 0.45 || bestCandidate.score < 0.55) {
    return registerName;
  }

  return mergePredictedNameWithRegister(bestCandidate.name, registerName);
}

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function classifySourceType(url: string, officialDomain: string | undefined): CandidateUrlInput["sourceType"] {
  const candidateDomain = normalizeDomain(url);
  if (candidateDomain && officialDomain && isSameOrSubdomain(candidateDomain, officialDomain)) {
    return "official";
  }
  return "serp";
}

export class SerperCandidateDiscovery implements CandidateDiscoveryProvider {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly resultLimit: number;
  private readonly fetchImpl: typeof fetch;
  private readonly gl: string | undefined;
  private readonly hl: string | undefined;
  private readonly location: string | undefined;

  constructor(options: SerperCandidateDiscoveryOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SERPER_API_KEY ?? process.env.SERPER_DEV_API_KEY;
    this.endpoint = options.endpoint ?? "https://google.serper.dev/search";
    this.resultLimit = options.resultLimit ?? 10;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.gl = options.gl;
    this.hl = options.hl;
    this.location = options.location;
  }

  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<DiscoveryResult> {
    const { candidates, warnings } = await this.discoverCandidatesWithTrace(brief, context);
    return { candidates, warnings };
  }

  async discoverCandidatesWithTrace(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<SerperDiscoveryResult> {
    const warnings: PipelineWarning[] = [];
    const candidates: CandidateUrlInput[] = [];
    const queries: string[] = [];
    const officialDomain = brief.resolvedInput.officialDomainResolved;

    void context;

    const apiKey = this.apiKey;
    if (!apiKey) {
      warnings.push({
        stage: "discovery",
        message: "SERPER_API_KEY is not configured; skipped Serper.dev candidate discovery.",
      });
      return {
        candidates,
        warnings,
        trace: {
          queries,
          skuDiscoveryQuery: buildSkuDiscoveryQuery(brief),
          predictedName: cleanSearchText(brief.input.registerName),
          officialDomainQuery: undefined,
          skuDiscoveryCandidateCount: 0,
          officialDomainCandidateCount: 0,
        },
      };
    }

    const runQuery = async (query: string) => {
      queries.push(query);

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": apiKey,
          },
          body: JSON.stringify({
            q: query,
            num: this.resultLimit,
            ...(this.gl ? { gl: this.gl } : {}),
            ...(this.hl ? { hl: this.hl } : {}),
            ...(this.location ? { location: this.location } : {}),
          }),
        });
      } catch (error) {
        warnings.push({
          stage: "discovery",
          message: `Serper.dev request failed for query ${query}: ${error instanceof Error ? error.message : String(error)}`,
        });
        return undefined;
      }

      if (!response.ok) {
        warnings.push({
          stage: "discovery",
          message: `Serper.dev request failed for query ${query}: HTTP ${response.status}`,
        });
        return undefined;
      }

      try {
        return await response.json() as SerperResponse;
      } catch (error) {
        warnings.push({
          stage: "discovery",
          message: `Serper.dev returned invalid JSON for query ${query}: ${error instanceof Error ? error.message : String(error)}`,
        });
        return undefined;
      }
    };

    const appendCandidates = (payload: SerperResponse, query: string) => {
      let appended = 0;
      const discoveredFrom = `serper:${query}`;
      const kgWebsite = payload.knowledgeGraph?.website;
      if (kgWebsite && isValidUrl(kgWebsite)) {
        candidates.push({
          url: kgWebsite,
          sourceType: classifySourceType(kgWebsite, officialDomain),
          title: payload.knowledgeGraph?.title,
          snippet: payload.knowledgeGraph?.description,
          discoveredFrom,
        });
        appended += 1;
      }

      for (const result of payload.organic ?? []) {
        if (!result.link || !isValidUrl(result.link)) {
          continue;
        }

        candidates.push({
          url: result.link,
          sourceType: classifySourceType(result.link, officialDomain),
          ...(result.title ? { title: result.title } : {}),
          ...(result.snippet ? { snippet: result.snippet } : {}),
          discoveredFrom,
        });
        appended += 1;
      }

      return appended;
    };

    const skuDiscoveryQuery = buildSkuDiscoveryQuery(brief);
    const skuDiscoveryPayload = await runQuery(skuDiscoveryQuery);
    const skuDiscoveryCandidateCount = skuDiscoveryPayload
      ? appendCandidates(skuDiscoveryPayload, skuDiscoveryQuery)
      : 0;

    const predictedName = skuDiscoveryPayload
      ? selectPredictedName(brief, skuDiscoveryPayload)
      : cleanSearchText(brief.input.registerName);
    const officialDomainQuery = buildOfficialDomainQuery(brief, predictedName);
    const productCodeHints = skuDiscoveryPayload ? extractProductCodeHints(brief, skuDiscoveryPayload) : [];
    const officialCodeQueries = productCodeHints
      .map((code) => buildOfficialCodeQuery(brief, code))
      .filter((query, index, values): query is string => Boolean(query) && values.indexOf(query) === index);

    let officialDomainCandidateCount = 0;
    if (officialDomainQuery) {
      const officialDomainPayload = await runQuery(officialDomainQuery);
      if (officialDomainPayload) {
        officialDomainCandidateCount = appendCandidates(officialDomainPayload, officialDomainQuery);
      }
    }

    for (const officialCodeQuery of officialCodeQueries) {
      const officialCodePayload = await runQuery(officialCodeQuery);
      if (officialCodePayload) {
        officialDomainCandidateCount += appendCandidates(officialCodePayload, officialCodeQuery);
      }
    }

    return {
      candidates,
      warnings,
      trace: {
        queries,
        skuDiscoveryQuery,
        predictedName,
        officialDomainQuery,
        skuDiscoveryCandidateCount,
        officialDomainCandidateCount,
      },
    };
  }
}
