import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";

export class MetaExtractor implements PageFactExtractor {
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

    if (!page.html) {
      return factSet;
    }

    const metaRegex = /<meta\b([^>]+)>/gi;
    const attributeRegex = /(\b\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))/g;

    const metaTags: { name?: string; property?: string; content?: string }[] = [];
    let match;

    metaRegex.lastIndex = 0;
    while ((match = metaRegex.exec(page.html)) !== null) {
      const inner = match[1];
      const tagAttrs: Record<string, string> = {};
      let attrMatch;
      attributeRegex.lastIndex = 0;
      while ((attrMatch = attributeRegex.exec(inner)) !== null) {
        const key = attrMatch[1].toLowerCase();
        const val = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || ""));
        tagAttrs[key] = val;
      }
      metaTags.push({
        name: tagAttrs.name,
        property: tagAttrs.property,
        content: tagAttrs.content,
      });
    }

    let ogTitle: string | undefined;
    let twitterTitle: string | undefined;
    let standardTitle: string | undefined;

    let ogDescription: string | undefined;
    let twitterDescription: string | undefined;
    let standardDescription: string | undefined;

    const images: string[] = [];

    // Parse extracted meta tags
    for (const tag of metaTags) {
      const name = tag.name?.toLowerCase();
      const prop = tag.property?.toLowerCase();
      const content = tag.content?.trim();

      if (!content) continue;

      // Evidence snippet collection
      if (
        name?.includes("title") ||
        prop?.includes("title") ||
        name?.includes("description") ||
        prop?.includes("description") ||
        prop?.startsWith("product:") ||
        prop?.startsWith("og:product")
      ) {
        factSet.evidenceSnippets.push(`meta[${prop || name}] = ${content}`);
      }

      // Title
      if (prop === "og:title") ogTitle = content;
      else if (name === "twitter:title") twitterTitle = content;

      // Description
      if (prop === "og:description") ogDescription = content;
      else if (name === "twitter:description") twitterDescription = content;
      else if (name === "description") standardDescription = content;

      // Images
      if (prop === "og:image" || prop === "og:image:url" || prop === "og:image:secure_url" || name === "twitter:image") {
        if (!images.includes(content)) {
          images.push(content);
        }
      }

      // Attributes: brand, SKU, GTIN, MPN, price, currency, availability
      if (prop === "product:brand" || name === "product:brand") {
        factSet.attributes.brand = content;
      } else if (prop === "product:retailer_item_id" || name === "product:retailer_item_id" || prop === "product:sku" || name === "product:sku") {
        factSet.attributes.sku = content;
      } else if (prop === "product:upc" || name === "product:upc" || prop === "product:gtin" || name === "product:gtin") {
        factSet.attributes.gtin = content;
      } else if (prop === "product:mfr_part_no" || name === "product:mfr_part_no") {
        factSet.attributes.mpn = content;
      } else if (prop === "product:availability" || name === "product:availability") {
        factSet.attributes.availability = content;
      }
    }

    // Title fallback to <title> tag
    const titleRegex = /<title>([\s\S]*?)<\/title>/i;
    const titleMatch = titleRegex.exec(page.html);
    if (titleMatch) {
      standardTitle = titleMatch[1].trim();
      factSet.evidenceSnippets.push(`title tag = ${standardTitle}`);
    }

    factSet.title = ogTitle || twitterTitle || standardTitle;
    factSet.description = ogDescription || twitterDescription || standardDescription;
    factSet.images = images;

    if (factSet.title || factSet.description || images.length > 0 || Object.keys(factSet.attributes).length > 0) {
      factSet.confidence = 0.78;
    }

    return factSet;
  }
}
