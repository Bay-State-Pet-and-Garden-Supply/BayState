import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { tokenizeText } from "../../lib/tokens";

const GENERIC_TITLE_PATTERNS = [
  /page not found/i,
  /oops/i,
  /just a moment/i,
  /site search results/i,
  /search results/i,
  /verifying your connection/i,
  /access denied/i,
  /^home\b/i,
  /\bhome$/i,
];

const GENERIC_DESCRIPTION_PATTERNS = [
  /sign-?up/i,
  /all rights reserved/i,
  /privacy policy/i,
  /store locator/i,
  /newsletter/i,
  /contact us/i,
  /submit/i,
  /site map/i,
  /page not found/i,
  /search results/i,
];

function stripHtml(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(url: string | undefined, baseUrl: string) {
  if (!url) return undefined;
  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      if (url.startsWith("//")) {
        try {
          return new URL(`https:${url}`).toString();
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
}

function extractTagText(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...html.matchAll(regex)].map((match) => stripHtml(match[1])).filter(Boolean);
}

function extractCanonicalUrl(html: string) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]?.trim();
}

function extractMetaContents(html: string, keys: string[]) {
  const results: string[] = [];
  for (const key of keys) {
    const regex = new RegExp(`<meta\\b[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)`, "gi");
    for (const match of html.matchAll(regex)) {
      const content = match[1]?.trim();
      if (content) results.push(content);
    }
  }
  return [...new Set(results)];
}

function looksGenericTitle(title: string | undefined, pageUrl: string) {
  if (!title) return false;
  const pathname = (() => {
    try {
      return new URL(pageUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    || pathname === "/"
    || pathname.includes("/search")
    || pathname.includes("/collections/")
    || pathname.includes("/collection/")
    || pathname.includes("/incentive-requests/");
}

function looksGenericDescription(text: string | undefined) {
  if (!text) return true;
  return GENERIC_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text));
}

function extractParagraphDescription(html: string, text: string, titleTokens: string[]) {
  const paragraphs = extractTagText(html, "p")
    .filter((value) => value.length >= 35 && value.length <= 500)
    .filter((value) => !looksGenericDescription(value));

  const scoredParagraphs = paragraphs.map((paragraph) => {
    const lower = paragraph.toLowerCase();
    const tokenMatches = titleTokens.filter((token) => lower.includes(token)).length;
    return { paragraph, score: tokenMatches * 2 + Math.min(paragraph.length / 120, 3) };
  }).sort((left, right) => right.score - left.score);

  if (scoredParagraphs[0]?.score > 0) {
    return scoredParagraphs[0].paragraph;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 35 && line.length <= 500)
    .filter((line) => !looksGenericDescription(line));

  return lines[0];
}

function collectImageCandidates(html: string, baseUrl: string, titleTokens: string[]) {
  const candidates = new Map<string, { url: string; score: number }>();

  const addCandidate = (rawUrl: string | undefined, score: number, context = "") => {
    const absoluteUrl = toAbsoluteUrl(rawUrl, baseUrl);
    if (!absoluteUrl) return;

    let finalScore = score;
    const haystack = `${absoluteUrl} ${context}`.toLowerCase();

    if (/logo|icon|sprite|tracking|facebook\.com\/tr|banner|hero|menu|placeholder|avatar|thumb/i.test(haystack)) {
      finalScore -= 1.2;
    }
    if (/product|products|shopify|cdn|media/i.test(haystack)) {
      finalScore += 0.2;
    }
    if (titleTokens.some((token) => haystack.includes(token))) {
      finalScore += 0.25;
    }
    if (!/\.(?:jpg|jpeg|png|gif|webp|avif)(?:$|[?#])/i.test(absoluteUrl)) {
      finalScore -= 0.1;
    }
    if (finalScore <= 0) return;

    const existing = candidates.get(absoluteUrl);
    if (!existing || existing.score < finalScore) {
      candidates.set(absoluteUrl, { url: absoluteUrl, score: finalScore });
    }
  };

  for (const image of extractMetaContents(html, ["og:image", "og:image:url", "twitter:image", "image"])) {
    addCandidate(image, 1.0, "meta-image");
  }

  const imgTagRegex = /<(img|source)\b([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const attrs = match[2] ?? "";
    const context = attrs.match(/alt=["']([^"']+)/i)?.[1] ?? attrs;
    const scalarSources = [
      attrs.match(/(?:src|data-src|data-original|data-image)=["']([^"']+)/i)?.[1],
    ];
    const setSources = [
      attrs.match(/(?:srcset|data-srcset)=["']([^"']+)/i)?.[1],
    ];

    for (const source of scalarSources) {
      addCandidate(source, 0.7, context);
    }

    for (const setSource of setSources) {
      if (!setSource) continue;
      for (const part of setSource.split(",")) {
        const source = part.trim().split(/\s+/)[0];
        addCandidate(source, 0.75, context);
      }
    }
  }

  const jsonImageRegex = /"(?:image|images|image_url|featured_image|src)"\s*:\s*(?:\[)?\s*"([^"\\]+(?:jpg|jpeg|png|gif|webp|avif)[^"\\]*)"/gi;
  while ((match = jsonImageRegex.exec(html)) !== null) {
    addCandidate(match[1], 0.85, "json-image");
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.url)
    .slice(0, 8);
}

function extractSize(text: string) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s?(oz|lb|lbs|g|kg|ml|gal)\b/i);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : undefined;
}

export class ProductDomExtractor implements PageFactExtractor {
  async extractFacts(
    page: AcquiredPage,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<PageFactSet> {
    const html = page.html ?? "";
    const text = page.text ?? "";
    const sourceUrl = page.finalUrl || page.url;

    const factSet: PageFactSet = {
      sourceUrl,
      title: undefined,
      description: undefined,
      images: [],
      categories: [],
      attributes: {},
      evidenceSnippets: [],
      confidence: 0,
    };

    if (!html && !text) {
      return factSet;
    }

    const h1Candidates = html ? extractTagText(html, "h1") : [];
    const h2Candidates = html ? extractTagText(html, "h2") : [];
    const canonicalUrl = html ? extractCanonicalUrl(html) : undefined;
    const metaDescriptions = html ? extractMetaContents(html, ["description", "og:description", "twitter:description"]) : [];
    const metaTitles = html ? extractMetaContents(html, ["og:title", "twitter:title"]) : [];

    factSet.title = h1Candidates.find((title) => title.length >= 3)
      ?? page.title
      ?? metaTitles[0];

    const titleTokens = tokenizeText(factSet.title, ...metaTitles).filter((token) => token.length > 2);
    const genericPage = looksGenericTitle(factSet.title, sourceUrl);

    const goodMetaDescription = metaDescriptions.find((value) => !looksGenericDescription(value));
    factSet.description = !genericPage
      ? (goodMetaDescription ?? extractParagraphDescription(html, text, titleTokens))
      : undefined;

    factSet.images = genericPage ? [] : collectImageCandidates(html, sourceUrl, titleTokens);

    const breadcrumbText = text.match(/([A-Za-z][A-Za-z\s&]+\s\/\s[A-Za-z][A-Za-z\s&]+(?:\s\/\s[A-Za-z][A-Za-z\s&]+)*)/);
    if (breadcrumbText?.[1] && !genericPage) {
      factSet.categories = breadcrumbText[1].split("/").map((part) => part.trim()).filter(Boolean).slice(0, 4);
    }

    if (canonicalUrl) {
      factSet.attributes.canonicalUrl = canonicalUrl;
      factSet.evidenceSnippets.push(`canonical = ${canonicalUrl}`);
    }

    const size = extractSize(`${factSet.title ?? ""} ${factSet.description ?? ""} ${text}`);
    if (size) {
      factSet.attributes.size = size;
      factSet.evidenceSnippets.push(`size = ${size}`);
    }

    if (brief.input.brand) {
      factSet.attributes.brand = brief.input.brand;
    }

    if (factSet.title) {
      factSet.evidenceSnippets.push(`h1/title = ${factSet.title}`);
    }
    if (factSet.description) {
      factSet.evidenceSnippets.push(`description = ${factSet.description.slice(0, 180)}`);
    }
    if (factSet.images.length > 0) {
      factSet.evidenceSnippets.push(`images = ${factSet.images.slice(0, 3).join(", ")}`);
    }

    const signals = [
      Boolean(factSet.title && !genericPage),
      Boolean(factSet.description),
      factSet.images.length > 0,
      factSet.categories.length > 0,
      Object.keys(factSet.attributes).length > 0,
    ].filter(Boolean).length;

    factSet.confidence = genericPage
      ? Math.min(0.35, signals >= 2 ? 0.3 : 0.18)
      : signals >= 4
        ? 0.8
        : signals >= 3
          ? 0.68
          : signals >= 2
            ? 0.5
            : 0.24;
    return factSet;
  }
}
