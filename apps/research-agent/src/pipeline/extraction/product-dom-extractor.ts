import type { PageFactExtractor } from "../ports";
import type { AcquiredPage, PageFactSet, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { tokenizeText } from "../../lib/tokens";
import { canonicalizeImageUrl, toAbsoluteImageUrl } from "./image-utils";

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

const GALLERY_CONTEXT_HINTS = [
  "gallery",
  "carousel",
  "slider",
  "thumbnail",
  "thumbnails",
  "product-media",
  "product_media",
  "product__media",
  "product-gallery",
  "product_gallery",
  "product-images",
  "product_images",
  "media-gallery",
  "main-image",
  "main_image",
  "fotorama",
  "swiper",
  "splide",
  "zoom",
];

const NON_PRODUCT_SECTION_HINTS = [
  "related",
  "recommended",
  "recommendation",
  "upsell",
  "crosssell",
  "cross-sell",
  "similar",
  "recently-viewed",
  "footer",
  "header",
  "newsletter",
  "social",
  "review",
  "reviews",
  "ugc",
  "blog",
  "article",
  "collection",
  "search",
  "category",
  "brand-story",
];

const DUPLICATE_CONTEXT_HINTS = [
  "slick-cloned",
  "swiper-slide-duplicate",
  "cloned",
  "duplicate",
];

const NON_PRODUCT_IMAGE_HINT_RE = /logo|icon|sprite|tracking|facebook\.com\/tr|menu|placeholder|avatar|thumb|recycle|footer|social|newsletter|flag|badge|buynow|buy-now|cart|checkout/i;
const PRODUCT_IMAGE_HINT_RE = /product|products|cdn|media|gallery|zoom|main/i;
const IMAGE_EXT_RE = /\.(?:jpg|jpeg|png|gif|webp|avif)(?:$|[?#])/i;
const JSON_IMAGE_RE = /"(?:image|images|image_url|featured_image|src)"\s*:\s*(?:\[)?\s*"([^"\\]+(?:jpg|jpeg|png|gif|webp|avif)[^"\\]*)"/gi;

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

type DomImageCandidate = {
  rawUrl: string;
  context: string;
  baseScore: number;
  galleryContext: boolean;
  nonProductContext: boolean;
  duplicateContext: boolean;
};

function hasHint(haystack: string, hints: string[]) {
  return hints.some((hint) => haystack.includes(hint));
}

function extractDomImageCandidates(html: string): DomImageCandidate[] {
  const candidates: DomImageCandidate[] = [];
  const tagRegex = /<(img|source|a)\b([^>]+)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const beforeContext = html.slice(
      Math.max(0, match.index - 260),
      match.index,
    ).toLowerCase();
    const afterContext = html.slice(
      match.index + match[0].length,
      Math.min(html.length, match.index + match[0].length + 80),
    ).toLowerCase();
    const contextWindow = `${beforeContext} ${match[0].toLowerCase()} ${afterContext}`;
    const alt = attrs.match(/alt=["']([^"']*)/i)?.[1] ?? "";
    const galleryContext = hasHint(contextWindow, GALLERY_CONTEXT_HINTS) && !hasHint(beforeContext, NON_PRODUCT_SECTION_HINTS);
    const nonProductContext = hasHint(beforeContext, NON_PRODUCT_SECTION_HINTS) || /<(?:footer|aside)\b/i.test(beforeContext);
    const duplicateContext = hasHint(contextWindow, DUPLICATE_CONTEXT_HINTS);

    const addCandidate = (rawUrl: string | undefined, baseScore: number) => {
      if (!rawUrl) return;
      candidates.push({
        rawUrl,
        context: `${alt} ${attrs}`,
        baseScore,
        galleryContext,
        nonProductContext,
        duplicateContext,
      });
    };

    if (tag === "a") {
      const href = attrs.match(/href=["']([^"']+)/i)?.[1];
      if (href && IMAGE_EXT_RE.test(href)) {
        addCandidate(href, galleryContext ? 0.9 : 0.5);
      }
      continue;
    }

    for (const source of [
      attrs.match(/(?:src|data-src|data-original|data-image|data-zoom-image|data-full-image|data-large-image|data-large_image)=["']([^"']+)/i)?.[1],
    ]) {
      addCandidate(source, galleryContext ? 0.9 : 0.7);
    }

    for (const setSource of [
      attrs.match(/(?:srcset|data-srcset)=["']([^"']+)/i)?.[1],
    ]) {
      if (!setSource) continue;
      for (const part of setSource.split(",")) {
        const source = part.trim().split(/\s+/)[0];
        addCandidate(source, galleryContext ? 0.95 : 0.75);
      }
    }
  }

  return candidates;
}

function collectImageCandidates(html: string, baseUrl: string, identityTokens: string[]) {
  const candidates = new Map<string, { url: string; canonicalUrl: string; score: number }>();

  const addCandidate = (
    rawUrl: string | undefined,
    score: number,
    context = "",
    flags: Partial<Pick<DomImageCandidate, "galleryContext" | "nonProductContext" | "duplicateContext">> = {},
  ) => {
    const absoluteUrl = toAbsoluteImageUrl(rawUrl, baseUrl);
    if (!absoluteUrl) return;

    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeImageUrl(absoluteUrl);
    } catch {
      canonicalUrl = absoluteUrl;
    }

    let finalScore = score;
    const haystack = `${absoluteUrl} ${canonicalUrl} ${context}`.toLowerCase();

    if (flags.galleryContext) {
      finalScore += 1.2;
    }
    if (flags.nonProductContext) {
      finalScore -= 1.8;
    }
    if (flags.duplicateContext) {
      finalScore -= 1.0;
    }

    if (NON_PRODUCT_IMAGE_HINT_RE.test(haystack)) {
      finalScore -= 1.4;
    }
    if (PRODUCT_IMAGE_HINT_RE.test(haystack)) {
      finalScore += 0.2;
    }

    const tokenMatches = identityTokens.filter((token) => haystack.includes(token)).length;
    finalScore += Math.min(tokenMatches * 0.18, 0.72);

    if (!IMAGE_EXT_RE.test(absoluteUrl)) {
      finalScore -= 0.1;
    }

    if (finalScore <= 0) return;

    const existing = candidates.get(canonicalUrl);
    if (!existing || existing.score < finalScore) {
      candidates.set(canonicalUrl, {
        url: absoluteUrl,
        canonicalUrl,
        score: finalScore,
      });
    }
  };

  for (const image of extractMetaContents(html, ["og:image", "og:image:url", "twitter:image", "image"])) {
    addCandidate(image, 1.0, "meta-image");
  }

  for (const candidate of extractDomImageCandidates(html)) {
    addCandidate(candidate.rawUrl, candidate.baseScore, candidate.context, candidate);
  }

  let match: RegExpExecArray | null;
  while ((match = JSON_IMAGE_RE.exec(html)) !== null) {
    addCandidate(match[1], 0.85, "json-image");
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.url)
    .slice(0, 8);
}

function extractCategoriesFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.includes("/")) {
      continue;
    }

    const categories = line
      .split("/")
      .map((part) => stripHtml(part))
      .map((part) => part.trim())
      .filter((part) => part.length >= 3);

    if (categories.length >= 2) {
      return categories.slice(0, 4);
    }
  }

  return [] as string[];
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

    void context;

    if (!html && !text) {
      return factSet;
    }

    const h1Candidates = html ? extractTagText(html, "h1") : [];
    const canonicalUrl = html ? extractCanonicalUrl(html) : undefined;
    const metaDescriptions = html ? extractMetaContents(html, ["description", "og:description", "twitter:description"]) : [];
    const metaTitles = html ? extractMetaContents(html, ["og:title", "twitter:title"]) : [];

    factSet.title = h1Candidates.find((title) => title.length >= 3)
      ?? page.title
      ?? metaTitles[0];

    const titleTokens = tokenizeText(factSet.title, ...metaTitles).filter((token) => token.length > 2);
    const identityTokens = tokenizeText(
      brief.input.brand,
      brief.input.registerName,
      factSet.title,
      ...metaTitles,
    ).filter((token) => token.length > 2);
    const genericPage = looksGenericTitle(factSet.title, sourceUrl);

    const goodMetaDescription = metaDescriptions.find((value) => !looksGenericDescription(value));
    factSet.description = !genericPage
      ? (goodMetaDescription ?? extractParagraphDescription(html, text, titleTokens))
      : undefined;

    factSet.images = genericPage ? [] : collectImageCandidates(html, sourceUrl, identityTokens);

    if (!genericPage) {
      factSet.categories = extractCategoriesFromText(text);
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
