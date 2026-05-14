import {
  evaluateScrapeQuality,
  type ScrapeQualityVerdict,
} from '@/lib/pipeline/scrape-quality';

describe('evaluateScrapeQuality', () => {
  const sku = 'BS-001';

  const validSource = {
    title: 'Premium Dog Food',
    brand: 'Acme Pet',
    url: 'https://acmepet.com/products/dog-food',
    price: 24.99,
    stock_status: 'in_stock',
  };

  const minimalPassSource = {
    name: 'Cat Toy',
    manufacturer: 'Purrfect Toys',
    product_url: 'https://purrfect.com/cat-toy',
  };

  it('returns pass when source has all core fields', () => {
    const sources = {
      scraper_a: validSource,
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
    expect(verdict.matchedSourceKeys).toContain('scraper_a');
    expect(verdict.missingFields).toHaveLength(0);
    expect(verdict.hasMatchedSku).toBe(true);
  });

  it('returns pass when source uses field name variants', () => {
    const sources = {
      scraper_b: {
        product_name: 'Bone Treats',
        vendor: 'Bark Inc.',
        page_url: 'https://bark.com/treats',
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
  });

  it('returns pass when source has minimal core fields: name + manufacturer + url', () => {
    const sources = {
      scraper_c: minimalPassSource,
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
  });

  it('returns needs_fallback_review when source has matched SKU but no title', () => {
    const sources = {
      scraper_d: {
        sku: sku,
        brand: 'Generic Brand',
        url: 'https://generic.com/item',
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('needs_fallback_review');
    expect(verdict.missingFields).toContain('title/name');
    expect(verdict.hasMatchedSku).toBe(true);
  });

  it('returns needs_fallback_review when source has matched SKU and title but no brand and no url', () => {
    const sources = {
      scraper_e: {
        sku: sku,
        title: 'Product Name Only',
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('needs_fallback_review');
    expect(verdict.missingFields).toContain('brand/manufacturer');
  });

  it('returns needs_fallback_review when sources object is empty', () => {
    const verdict = evaluateScrapeQuality(sku, null, {});
    expect(verdict.result).toBe('needs_fallback_review');
    expect(verdict.missingFields).toContain('any source');
    expect(verdict.hasMatchedSku).toBe(false);
    expect(verdict.matchedSourceKeys).toHaveLength(0);
  });

  it('returns pass even when price is missing (price is excluded)', () => {
    const sources = {
      scraper_f: {
        title: 'Price-lacking Product',
        brand: 'Value Brand',
        url: 'https://valuebrand.com/product',
        // No price, no stock_status, no availability
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
    expect(verdict.missingFields).toHaveLength(0);
  });

  it('returns passes with mixed sources - one good source', () => {
    const sources = {
      scraper_g: {
        title: 'Good Product',
        brand: 'Good Brand',
        url: 'https://good.com/product',
      },
      scraper_h: {
        description: 'Just a description',
        price: 9.99,
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
    expect(verdict.matchedSourceKeys).toContain('scraper_g');
    expect(verdict.sourceScores['scraper_g']).toBeGreaterThan(0);
  });

  it('returns needs_fallback_review with only partial fields and no identifier', () => {
    const sources = {
      scraper_i: {
        url: 'https://random.com/page',
        description: 'Some product description',
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('needs_fallback_review');
    expect(verdict.hasMatchedSku).toBe(true);
  });

  it('handles null input gracefully', () => {
    const sources = {
      scraper_j: validSource,
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
  });

  it('returns needs_fallback_review for non-object source values', () => {
    const sources = {
      scraper_k: null,
      scraper_l: 'just a string',
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('needs_fallback_review');
  });

  it('returns pass when SKU matches in gtin field', () => {
    const sources = {
      scraper_m: {
        gtin: 'BS-001',
        title: 'GTIN Product',
        brand: 'GTIN Brand',
        url: 'https://gtin.com/product',
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
  });

  it('returns pass when SKU matches numeric identifier', () => {
    const sources = {
      scraper_n: {
        product_id: 1,
        title: 'Numeric ID Product',
        brand: 'Num Brand',
        url: 'https://num.com/product',
      },
    };
    const verdict = evaluateScrapeQuality('1', null, sources);
    expect(verdict.result).toBe('pass');
  });

  it('returns pass with title + brand (no url needed if brand present)', () => {
    // Per the evaluator rules: pass requires matched identifier + title + (brand OR url)
    const sources = {
      scraper_o: {
        sku: sku,
        title: 'Brand-only Product',
        brand: 'MyBrand',
        // No URL field
      },
    };
    const verdict = evaluateScrapeQuality(sku, null, sources);
    expect(verdict.result).toBe('pass');
    expect(verdict.hasMatchedSku).toBe(true);
  });

  it('does not consider price absence a failure', () => {
    const sources = {
      scraper_p: {
        sku: sku,
        title: 'No Price Product',
        brand: 'NoPriceBrand',
        url: 'https://noprice.com/product',
        stock: 42,
        weight: '10lb',
      },
    };
    // Remove any price-like field
    const cleanSource = { ...sources.scraper_p };
    delete (cleanSource as Record<string, unknown>).stock;
    const verdict = evaluateScrapeQuality(sku, null, { scraper_p: cleanSource });
    expect(verdict.result).toBe('pass');
    // price should never appear in missingFields
    expect(verdict.missingFields).not.toContain('price');
  });
});
