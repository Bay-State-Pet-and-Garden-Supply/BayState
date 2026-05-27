import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";

export class JsonLdExtractor implements PageFactExtractor {
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
      jsonLd: [],
    };

    if (!page.html) {
      return factSet;
    }

    const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    const foundProducts: any[] = [];
    const rawJsonLdList: any[] = [];

    scriptRegex.lastIndex = 0;
    while ((match = scriptRegex.exec(page.html)) !== null) {
      const scriptContent = match[1].trim();
      let clean = scriptContent;
      if (clean.startsWith("<![CDATA[")) {
        clean = clean.substring(9);
      }
      if (clean.endsWith("]]>")) {
        clean = clean.substring(0, clean.length - 3);
      }

      try {
        const parsed = JSON.parse(clean.trim());
        rawJsonLdList.push(parsed);
        const products = this.findProducts(parsed);
        if (products.length > 0) {
          foundProducts.push(...products);
          factSet.evidenceSnippets.push(scriptContent.substring(0, 1000)); // Sample/trunc snippet for reference
        }
      } catch (e) {
        // Ignore JSON parse errors for malformed/unrelated script blocks
      }
    }

    if (foundProducts.length === 0) {
      return factSet;
    }

    factSet.jsonLd = rawJsonLdList;
    factSet.confidence = 0.92;

    // Merge all found product facts (preferring the first non-empty values)
    for (const product of foundProducts) {
      if (!factSet.title && product.name && typeof product.name === "string") {
        factSet.title = product.name.trim();
      }

      if (!factSet.description && product.description && typeof product.description === "string") {
        factSet.description = product.description.trim();
      }

      const extractedImages = this.extractImages(product.image);
      for (const img of extractedImages) {
        if (!factSet.images.includes(img)) {
          factSet.images.push(img);
        }
      }

      const extractedCategories = this.extractCategories(product.category);
      for (const cat of extractedCategories) {
        if (!factSet.categories.includes(cat)) {
          factSet.categories.push(cat);
        }
      }

      // Extract attributes: brand, SKU, GTIN, MPN, weight, price, currency
      this.populateAttributes(product, factSet.attributes);
    }

    return factSet;
  }

  private findProducts(obj: any): any[] {
    if (!obj || typeof obj !== "object") return [];
    if (Array.isArray(obj)) {
      return obj.flatMap(item => this.findProducts(item));
    }
    const products: any[] = [];
    const type = obj["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      products.push(obj);
    }
    if (obj["@graph"] && Array.isArray(obj["@graph"])) {
      products.push(...obj["@graph"].flatMap(item => this.findProducts(item)));
    }
    // Check other nested objects
    for (const key of Object.keys(obj)) {
      if (key !== "@graph" && obj[key] && typeof obj[key] === "object") {
        products.push(...this.findProducts(obj[key]));
      }
    }
    return products;
  }

  private extractImages(imageVal: any): string[] {
    if (!imageVal) return [];
    if (typeof imageVal === "string") return [imageVal.trim()];
    if (Array.isArray(imageVal)) {
      return imageVal.flatMap(val => this.extractImages(val));
    }
    if (typeof imageVal === "object") {
      if (typeof imageVal.url === "string") return [imageVal.url.trim()];
      if (typeof imageVal.contentUrl === "string") return [imageVal.contentUrl.trim()];
    }
    return [];
  }

  private extractCategories(catVal: any): string[] {
    if (!catVal) return [];
    if (typeof catVal === "string") return [catVal.trim()];
    if (Array.isArray(catVal)) {
      return catVal.flatMap(val => this.extractCategories(val));
    }
    if (typeof catVal === "object" && typeof catVal.name === "string") {
      return [catVal.name.trim()];
    }
    return [];
  }

  private populateAttributes(product: any, attributes: Record<string, unknown>) {
    // Brand
    if (product.brand) {
      if (typeof product.brand === "string" && !attributes.brand) {
        attributes.brand = product.brand.trim();
      } else if (typeof product.brand === "object" && typeof product.brand.name === "string" && !attributes.brand) {
        attributes.brand = product.brand.name.trim();
      }
    }

    // SKU, MPN
    const stringKeys = ["sku", "mpn", "gtin", "gtin8", "gtin12", "gtin13", "gtin14"];
    for (const key of stringKeys) {
      if (product[key] !== undefined && !attributes[key]) {
        attributes[key] = String(product[key]).trim();
      }
    }

    // Offers (price, currency, availability)
    if (product.offers) {
      const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
      for (const offer of offers) {
        if (offer.price !== undefined && !attributes.price) {
          attributes.price = typeof offer.price === "number" ? offer.price : String(offer.price).trim();
        }
        if (offer.priceCurrency && !attributes.priceCurrency) {
          attributes.priceCurrency = String(offer.priceCurrency).trim();
        }
        if (offer.sku && !attributes.sku) {
          attributes.sku = String(offer.sku).trim();
        }
        for (const gtinKey of ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"]) {
          if (offer[gtinKey] !== undefined && !attributes[gtinKey]) {
            attributes[gtinKey] = String(offer[gtinKey]).trim();
          }
        }
        if (offer.availability && !attributes.availability) {
          attributes.availability = String(offer.availability).trim();
        }
      }
    }

    // Standard physical properties if they exist
    for (const key of ["weight", "color", "size", "material", "flavor"]) {
      if (product[key] !== undefined && !attributes[key]) {
        attributes[key] = typeof product[key] === "object" && product[key]?.value !== undefined
          ? product[key].value
          : product[key];
      }
    }
  }
}
