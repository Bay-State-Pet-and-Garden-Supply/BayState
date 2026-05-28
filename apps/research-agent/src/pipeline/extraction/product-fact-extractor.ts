import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { canonicalizeImageUrl } from "./image-utils";

export function mergePageFacts(factSets: PageFactSet[]): PageFactSet {
  if (factSets.length === 0) {
    throw new Error("Cannot merge empty array of PageFactSet");
  }

  // Sort fact sets by confidence descending so higher confidence values are preferred
  const sortedSets = [...factSets].sort((a, b) => b.confidence - a.confidence);

  const merged: PageFactSet = {
    sourceUrl: sortedSets[0].sourceUrl,
    images: [],
    categories: [],
    attributes: {},
    evidenceSnippets: [],
    confidence: Math.max(...sortedSets.map(s => s.confidence)),
    jsonLd: [],
    offers: [],
  };
  const seenCanonicalImages = new Set<string>();

  for (const set of sortedSets) {
    if (!merged.title && set.title) {
      merged.title = set.title;
    }
    if (!merged.description && set.description) {
      merged.description = set.description;
    }

    // Add unique images in order of set confidence, deduping CDN/query-size variants.
    for (const img of set.images) {
      let canonical = img;
      try {
        canonical = canonicalizeImageUrl(img);
      } catch {
        canonical = img;
      }
      if (!seenCanonicalImages.has(canonical)) {
        seenCanonicalImages.add(canonical);
        merged.images.push(img);
      }
    }

    // Add unique categories
    for (const cat of set.categories) {
      if (!merged.categories.includes(cat)) {
        merged.categories.push(cat);
      }
    }

    // Merge attributes, letting higher confidence overwrite
    merged.attributes = {
      ...set.attributes,
      ...merged.attributes, // Keep existing higher-confidence keys
    };

    // Also populate key attributes directly if not present (e.g., from lower confidence but specific keys)
    for (const key of Object.keys(set.attributes)) {
      if (merged.attributes[key] === undefined) {
        merged.attributes[key] = set.attributes[key];
      }
    }

    // Merge evidence snippets
    for (const snip of set.evidenceSnippets) {
      if (!merged.evidenceSnippets.includes(snip)) {
        merged.evidenceSnippets.push(snip);
      }
    }

    // Merge jsonLd
    if (set.jsonLd) {
      for (const js of set.jsonLd) {
        if (!merged.jsonLd!.some(existing => JSON.stringify(existing) === JSON.stringify(js))) {
          merged.jsonLd!.push(js);
        }
      }
    }

    // Merge offers
    if (set.offers) {
      for (const offer of set.offers) {
        const alreadyExists = merged.offers!.some(existing => {
          if (offer.gtins.length > 0 && existing.gtins.length > 0) {
            return offer.gtins.some(g => existing.gtins.includes(g));
          }
          if (offer.sku && existing.sku) {
            return offer.sku === existing.sku;
          }
          if (offer.name && existing.name) {
            return offer.name === existing.name;
          }
          return false;
        });

        if (!alreadyExists) {
          merged.offers!.push(offer);
        }
      }
    }
  }

  return merged;
}

export class CompositeProductFactExtractor implements PageFactExtractor {
  private extractors: PageFactExtractor[];

  constructor(extractors: PageFactExtractor[]) {
    this.extractors = extractors;
  }

  async extractFacts(
    page: AcquiredPage,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<PageFactSet> {
    const results = await Promise.all(
      this.extractors.map(ext => ext.extractFacts(page, brief, context))
    );

    return mergePageFacts(results);
  }
}
