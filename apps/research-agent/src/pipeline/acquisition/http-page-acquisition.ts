import type { PageAcquisitionProvider } from "../ports";
import type { AcquiredPage, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { savePageArtifacts } from "./acquisition-artifacts";

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
  constructor(private readonly options: { timeoutMs?: number } = {}) {}

  async acquirePage(
    url: string,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<AcquiredPage> {
    const timeoutMs = this.options.timeoutMs ?? 8_000;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      const finalUrl = response.url || url;
      const html = await response.text();

      // Extract title
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      // Extract plain text
      const text = cleanHtmlToText(html);

      const acquired: AcquiredPage = {
        url,
        finalUrl,
        statusCode: response.status,
        fetchedAt: new Date().toISOString(),
        title,
        html,
        text,
        metadata: {
          engine: "http",
          contentType: response.headers.get("content-type"),
        },
      };

      if (context.artifactRoot) {
        try {
          await savePageArtifacts(acquired, context.artifactRoot);
        } catch {
          // Ignore artifact persistence failures.
        }
      }

      return acquired;
    } catch (e: any) {
      const message = e?.name === "TimeoutError"
        ? `HTTP page acquisition timed out after ${timeoutMs}ms`
        : e?.message || String(e);

      const acquired: AcquiredPage = {
        url,
        finalUrl: url,
        statusCode: 599,
        fetchedAt: new Date().toISOString(),
        metadata: {
          engine: "http",
          error: message,
        },
      };

      if (context.artifactRoot) {
        try {
          await savePageArtifacts(acquired, context.artifactRoot);
        } catch {
          // Ignore artifact persistence failures.
        }
      }

      return acquired;
    }
  }
}
