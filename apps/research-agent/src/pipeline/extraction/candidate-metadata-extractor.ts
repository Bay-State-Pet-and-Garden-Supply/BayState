import type { EvaluatedCandidate } from "../../schemas/CandidateUrl";
import type { PageFactSet, ProductResearchBrief } from "../types";
import { normalizeBarcodes } from "../../lib/barcode";

const SIZE_REGEX = /\b(\d+(?:\.\d+)?)\s?(oz|lb|lbs|g|kg|ml|gal)\b/i;

function extractSize(text: string): string | undefined {
  const match = text.match(SIZE_REGEX);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : undefined;
}

function extractUpcs(text: string): string[] {
  return normalizeBarcodes(text.match(/\b\d{8,14}\b/g) ?? []);
}

function baseConfidence(candidate: EvaluatedCandidate) {
  switch (candidate.sourceType) {
    case "official":
      return 0.5;
    case "sitemap":
      return 0.46;
    case "distributor":
      return 0.42;
    case "serp":
      return 0.38;
    case "input":
      return 0.45;
    default:
      return 0.35;
  }
}

export function extractCandidateMetadataFacts(
  candidate: EvaluatedCandidate,
  brief: ProductResearchBrief,
): PageFactSet {
  const descriptiveText = [candidate.title, candidate.snippet, candidate.url]
    .filter((value): value is string => Boolean(value))
    .join(" \n ");

  const upcs = extractUpcs(descriptiveText);
  const size = extractSize(descriptiveText);
  const confidence = Math.min(
    0.72,
    baseConfidence(candidate)
      + (candidate.snippet ? 0.08 : 0)
      + (candidate.title ? 0.05 : 0)
      + (upcs.length > 0 ? 0.12 : 0),
  );

  const attributes: Record<string, unknown> = {};
  if (upcs.length > 0) {
    attributes.heuristicUpcs = upcs;
  }
  if (size) {
    attributes.size = size;
  }
  if (brief.input.brand) {
    attributes.brand = brief.input.brand;
  }

  return {
    sourceUrl: candidate.normalizedUrl,
    title: candidate.title,
    description: candidate.snippet,
    images: [],
    categories: [],
    attributes,
    evidenceSnippets: [
      ...(candidate.title ? [`candidate.title = ${candidate.title}`] : []),
      ...(candidate.snippet ? [`candidate.snippet = ${candidate.snippet}`] : []),
      ...(candidate.discoveredFrom ? [`candidate.discoveredFrom = ${candidate.discoveredFrom}`] : []),
    ],
    confidence,
  };
}
