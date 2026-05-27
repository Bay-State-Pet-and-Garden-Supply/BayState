import type { CandidateDiscoveryProvider } from "../ports";
import type { DiscoveryResult, ProductResearchBrief, ProductResearchPipelineContext, CandidateUrlInput } from "../types";

export class OfficialDomainDiscovery implements CandidateDiscoveryProvider {
  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<DiscoveryResult> {
    const candidates: CandidateUrlInput[] = [];
    const warnings: any[] = [];
    const domain = brief.resolvedInput.officialDomainResolved;
    const officialUrl = brief.input.officialWebsiteUrl;

    if (officialUrl) {
      candidates.push({
        url: officialUrl,
        sourceType: "official",
        title: `Official Website URL: ${brief.input.registerName}`,
      });
    }

    if (domain) {
      const baseUrl = `https://${domain}`;
      candidates.push({
        url: `${baseUrl}/search?q=${encodeURIComponent(brief.input.registerName)}`,
        sourceType: "official",
        title: `Official Search for ${brief.input.registerName}`,
      });

      // Try fetching sitemap.xml to discover product URLs
      try {
        const sitemapUrl = `${baseUrl}/sitemap.xml`;
        const response = await fetch(sitemapUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(3000), // 3s timeout
        });
        if (response.ok) {
          const text = await response.text();
          // Extract URLs using regex from <loc> tags
          const locRegex = /<loc>([\s\S]*?)<\/loc>/gi;
          let match;
          let count = 0;
          const identityTokens = brief.input.registerName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
          while ((match = locRegex.exec(text)) !== null && count < 10) {
            const url = match[1].trim();
            const lowerUrl = url.toLowerCase();
            // Look for product urls or urls containing product name keywords
            const isProductPattern = lowerUrl.includes("/products/") || lowerUrl.includes("/product/");
            const matchesKeywords = identityTokens.some(tok => lowerUrl.includes(tok));
            if (isProductPattern || (matchesKeywords && lowerUrl.includes(domain))) {
              candidates.push({
                url,
                sourceType: "sitemap",
                discoveredFrom: sitemapUrl,
              });
              count++;
            }
          }
        }
      } catch (e) {
        // Sitemap fetch is best-effort, ignore failures
      }
    }

    return {
      candidates,
      warnings,
    };
  }
}
