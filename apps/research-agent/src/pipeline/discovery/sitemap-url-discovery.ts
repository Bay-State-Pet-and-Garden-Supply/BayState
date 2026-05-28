import { gunzipSync } from "node:zlib";

const SITEMAP_ENTRY_REGEX = /<(?:[\w-]+:)?sitemap\b[^>]*>[\s\S]*?<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc>[\s\S]*?<\/(?:[\w-]+:)?sitemap>/gi;
const URL_ENTRY_REGEX = /<(?:[\w-]+:)?url\b[^>]*>[\s\S]*?<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc>[\s\S]*?<\/(?:[\w-]+:)?url>/gi;
const GENERAL_LOC_REGEX = /<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc>/gi;

export interface SitemapDiscoveryOptions {
  maxSitemaps?: number;
  maxUrls?: number;
  deadlineAt?: number;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractMatches(xml: string, regex: RegExp): string[] {
  const values: string[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    values.push(decodeXmlEntities(match[1].trim()));
  }

  return values;
}

function parseSitemapXml(xml: string): { nestedSitemaps: string[]; urls: string[] } {
  const nestedSitemaps = extractMatches(xml, SITEMAP_ENTRY_REGEX);
  if (nestedSitemaps.length > 0) {
    return { nestedSitemaps, urls: [] };
  }

  const urls = extractMatches(xml, URL_ENTRY_REGEX);
  if (urls.length > 0) {
    return { nestedSitemaps: [], urls };
  }

  return {
    nestedSitemaps: [],
    urls: extractMatches(xml, GENERAL_LOC_REGEX),
  };
}

async function readResponseText(response: any, sourceUrl: string): Promise<string> {
  if (typeof response.arrayBuffer === "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    const isGzip = sourceUrl.endsWith(".gz")
      || response.headers?.get?.("content-encoding")?.includes("gzip")
      || response.headers?.get?.("content-type")?.includes("gzip")
      || (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);

    return isGzip
      ? gunzipSync(buffer).toString("utf8")
      : buffer.toString("utf8");
  }

  return await response.text();
}

export async function discoverUrlsFromSitemap(
  sitemapUrl: string,
  fetchImpl: (url: string, init?: any) => Promise<any> = fetch,
  options: SitemapDiscoveryOptions = {},
): Promise<string[]> {
  const discoveredUrls = new Set<string>();
  const sitemapsToFetch = [sitemapUrl];
  const fetchedSitemaps = new Set<string>();
  const maxSitemaps = options.maxSitemaps ?? 50;
  const maxUrls = options.maxUrls ?? Number.POSITIVE_INFINITY;

  while (sitemapsToFetch.length > 0 && fetchedSitemaps.size < maxSitemaps && discoveredUrls.size < maxUrls) {
    if (options.deadlineAt && Date.now() >= options.deadlineAt) {
      break;
    }

    const currentUrl = sitemapsToFetch.shift()!;
    if (fetchedSitemaps.has(currentUrl)) continue;
    fetchedSitemaps.add(currentUrl);

    try {
      const response = await fetchImpl(currentUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;

      const text = await readResponseText(response, currentUrl);
      const parsed = parseSitemapXml(text);

      if (parsed.nestedSitemaps.length > 0) {
        for (const nestedUrl of parsed.nestedSitemaps) {
          if (!fetchedSitemaps.has(nestedUrl)) {
            sitemapsToFetch.push(nestedUrl);
          }
          if (sitemapsToFetch.length + fetchedSitemaps.size >= maxSitemaps) {
            break;
          }
        }
        continue;
      }

      for (const url of parsed.urls) {
        discoveredUrls.add(url);
        if (discoveredUrls.size >= maxUrls) {
          break;
        }
      }
    } catch {
      // Best effort per file
    }
  }

  return [...discoveredUrls];
}

export function parseRobotsTxtForSitemaps(content: string): string[] {
  const sitemaps: string[] = [];
  const lines = content.split(/\r?\n/);
  const sitemapRegex = /^sitemap:\s*(https?:\/\/\S+)/i;
  for (const line of lines) {
    const match = sitemapRegex.exec(line.trim());
    if (match && match[1]) {
      sitemaps.push(match[1].trim());
    }
  }
  return sitemaps;
}

export async function discoverSitemapsFromRobotsTxt(
  domain: string,
  fetchImpl: (url: string, init?: any) => Promise<any> = fetch,
): Promise<string[]> {
  const urls = [
    `https://${domain}/robots.txt`,
    `https://www.${domain}/robots.txt`
  ];
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const text = await response.text();
        const sitemaps = parseRobotsTxtForSitemaps(text);
        if (sitemaps.length > 0) {
          return sitemaps;
        }
      }
    } catch {
      // ignore individual failures, try next URL
    }
  }
  return [];
}
