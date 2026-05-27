import type { PageAcquisitionProvider } from "../ports";
import type { AcquiredPage, ProductResearchBrief, ProductResearchPipelineContext } from "../types";

export function cleanHtmlToText(html: string): string {
  // Remove head, script, style, nav, header, and footer content completely to avoid noise
  let text = html.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ");
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Replace common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

export class HttpPageAcquisition implements PageAcquisitionProvider {
  async acquirePage(
    url: string,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<AcquiredPage> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });

      const finalUrl = response.url || url;
      const html = await response.text();

      // Extract title
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      // Extract plain text
      const text = cleanHtmlToText(html);

      return {
        url,
        finalUrl,
        statusCode: response.status,
        fetchedAt: new Date().toISOString(),
        title,
        html,
        text,
        metadata: {
          contentType: response.headers.get("content-type"),
        },
      };
    } catch (e: any) {
      return {
        url,
        finalUrl: url,
        fetchedAt: new Date().toISOString(),
        metadata: {
          error: e.message || String(e),
        },
      };
    }
  }
}
