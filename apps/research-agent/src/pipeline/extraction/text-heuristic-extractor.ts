import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";

export class TextHeuristicExtractor implements PageFactExtractor {
  async extractFacts(
    page: AcquiredPage,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<PageFactSet> {
    const factSet: PageFactSet = {
      sourceUrl: page.finalUrl || page.url,
      images: [],
      categories: [],
      attributes: {},
      evidenceSnippets: [],
      confidence: 0.0,
    };

    const textToSearch = page.text || page.html;
    if (!textToSearch) {
      return factSet;
    }

    // 1. UPC/barcode: match 12, 13, or 14 digit sequences
    const upcRegex = /\b\d{12,14}\b/g;
    const upcMatches: string[] = [];
    let upcMatch;
    while ((upcMatch = upcRegex.exec(textToSearch)) !== null) {
      const candidateUpc = upcMatch[0];
      if (!upcMatches.includes(candidateUpc)) {
        upcMatches.push(candidateUpc);
      }
    }
    if (upcMatches.length > 0) {
      factSet.attributes.heuristicUpcs = upcMatches;
      factSet.evidenceSnippets.push(`Found UPC-like sequences: ${upcMatches.join(", ")}`);
    }

    // 2. Price patterns: like $14.99 or $149
    const priceRegex = /\$\s*(\d{1,4}(?:\.\d{2})?)\b/g;
    const priceMatches: string[] = [];
    let priceMatch;
    while ((priceMatch = priceRegex.exec(textToSearch)) !== null) {
      const val = priceMatch[1];
      if (!priceMatches.includes(val)) {
        priceMatches.push(val);
      }
    }
    if (priceMatches.length > 0) {
      factSet.attributes.heuristicPrice = priceMatches[0];
      factSet.evidenceSnippets.push(`Found potential prices: ${priceMatches.slice(0, 3).map(p => `$${p}`).join(", ")}`);
    }

    // 3. Size/weight patterns: e.g., 80 oz, 5 lb, 12 lbs
    const sizeRegex = /\b(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|ml|gal|ounce|ounces|pound|pounds|gram|grams)\b/gi;
    const sizeMatches: string[] = [];
    let sizeMatch;
    while ((sizeMatch = sizeRegex.exec(textToSearch)) !== null) {
      const fullSize = sizeMatch[0].trim();
      if (!sizeMatches.includes(fullSize)) {
        sizeMatches.push(fullSize);
      }
    }
    if (sizeMatches.length > 0) {
      factSet.attributes.heuristicSizes = sizeMatches;
      factSet.evidenceSnippets.push(`Found potential sizes: ${sizeMatches.slice(0, 5).join(", ")}`);
    }

    // Check if any evidence was found to assign confidence
    if (factSet.evidenceSnippets.length > 0) {
      factSet.confidence = 0.55;
    }

    return factSet;
  }
}
