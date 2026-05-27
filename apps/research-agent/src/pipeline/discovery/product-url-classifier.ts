export function classifyProductUrlHeuristics(
  urlStr: string,
  brandName?: string
): { isProductLike: boolean; score: number } {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname.toLowerCase();
    
    // Ignored/Low signal checks
    const lowSignalPatterns = [
      /\/blog\b/, /\/support\b/, /\/contact\b/, /\/account\b/, /\/cart\b/,
      /\/search\b/, /\/tag\b/, /\/faq\b/, /\/about\b/, /\/news\b/,
      /\/events\b/, /\/privacy\b/, /\/terms\b/, /\/jobs\b/, /\/careers\b/,
      /\.pdf$/, /\.zip$/, /\.png$/, /\.jpg$/, /\.jpeg$/, /\.gif$/
    ];

    if (lowSignalPatterns.some(pattern => pattern.test(pathname))) {
      return { isProductLike: false, score: 0 };
    }

    let score = 0.5; // base score

    // Positive indicators
    const productPathPatterns = [
      /\/product\//, /\/products\//, /\/shop\//, /\/item\//, /\/p\//,
      /\/recipes\//, /\/formula\//, /\/diet\//, /\/detail\//, /\/recipe\//,
      /\/cat-food\//, /\/dog-food\//
    ];

    if (productPathPatterns.some(pattern => pattern.test(pathname))) {
      score += 0.3;
    }

    // Brand name matching in pathname
    if (brandName) {
      const cleanBrand = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanBrand && pathname.includes(cleanBrand)) {
        score += 0.1;
      }
    }

    // Path segments count check: home page is score 0.
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return { isProductLike: false, score: 0 }; // Home page
    }
    
    // Deep product paths are more likely
    if (segments.length >= 2) {
      score += 0.1;
    }

    return {
      isProductLike: score >= 0.7,
      score: Math.min(1.0, score),
    };
  } catch {
    return { isProductLike: false, score: 0 };
  }
}
