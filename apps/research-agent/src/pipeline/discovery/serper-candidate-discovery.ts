import type { CandidateDiscoveryProvider } from "../ports";
import type {
  CandidateUrlInput,
  DiscoveryResult,
  PipelineWarning,
  ProductResearchBrief,
  ProductResearchPipelineContext,
} from "../types";
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

function quoteSearchTerm(value: string) {
  return `"${value.replaceAll('"', "").trim()}"`;
}

function buildQueries(brief: ProductResearchBrief) {
  const { brand, registerName, upc } = brief.input;
  const domain = brief.resolvedInput.officialDomainResolved;
  const productPhrase = `${brand} ${registerName}`.trim();
  const queries = [
    domain ? `site:${domain} ${quoteSearchTerm(upc)}` : undefined,
    domain ? `site:${domain} ${quoteSearchTerm(registerName)}` : undefined,
    `${quoteSearchTerm(upc)} ${brand}`,
    `${productPhrase} ${upc}`,
  ].filter((query): query is string => Boolean(query));

  return [...new Set(queries)];
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
    const warnings: PipelineWarning[] = [];
    const candidates: CandidateUrlInput[] = [];
    const officialDomain = brief.resolvedInput.officialDomainResolved;

    if (!this.apiKey) {
      warnings.push({
        stage: "discovery",
        message: "SERPER_API_KEY is not configured; skipped Serper.dev candidate discovery.",
      });
      return { candidates, warnings };
    }

    for (const query of buildQueries(brief)) {
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": this.apiKey,
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
        continue;
      }

      if (!response.ok) {
        warnings.push({
          stage: "discovery",
          message: `Serper.dev request failed for query ${query}: HTTP ${response.status}`,
        });
        continue;
      }

      let payload: SerperResponse;
      try {
        payload = await response.json() as SerperResponse;
      } catch (error) {
        warnings.push({
          stage: "discovery",
          message: `Serper.dev returned invalid JSON for query ${query}: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

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
      }
    }

    return { candidates, warnings };
  }
}
