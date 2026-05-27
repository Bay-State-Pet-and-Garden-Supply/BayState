import type { CandidateDiscoveryProvider } from "../ports";
import type { DiscoveryResult, ProductResearchBrief, ProductResearchPipelineContext, CandidateUrlInput } from "../types";
import { discoverUrlsFromSitemap } from "./sitemap-url-discovery";
import { classifyProductUrlHeuristics } from "./product-url-classifier";
import { tokenizeText } from "../../lib/tokens";
import { normalizeBarcode } from "../../lib/barcode";

export class OfficialDomainDiscovery implements CandidateDiscoveryProvider {
  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
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

      try {
        const sitemapUrl = `${baseUrl}/sitemap.xml`;
        const identityTokens = tokenizeText(brief.input.registerName);
        const normalizedUpc = normalizeBarcode(brief.input.upc);
        const sitemapCandidates = await discoverUrlsFromSitemap(sitemapUrl, fetch, {
          maxSitemaps: 15,
          maxUrls: 150,
        });

        const ranked = sitemapCandidates
          .map((url) => {
            const lowerUrl = url.toLowerCase();
            const { score, isProductLike } = classifyProductUrlHeuristics(url, brief.input.brand);
            const tokenMatches = identityTokens.filter((token) => lowerUrl.includes(token)).length;
            const upcMatch = normalizedUpc && lowerUrl.replace(/\D+/g, "").includes(normalizedUpc) ? 1 : 0;
            return {
              url,
              isProductLike,
              score: score + tokenMatches * 0.12 + upcMatch * 0.5,
            };
          })
          .filter((item) => item.isProductLike || item.score >= 0.75)
          .sort((left, right) => right.score - left.score)
          .slice(0, 10);

        for (const candidate of ranked) {
          candidates.push({
            url: candidate.url,
            sourceType: "sitemap",
            discoveredFrom: sitemapUrl,
          });
        }
      } catch {
        // Sitemap fetch is best-effort, ignore failures.
      }
    }

    return {
      candidates,
      warnings,
    };
  }
}
