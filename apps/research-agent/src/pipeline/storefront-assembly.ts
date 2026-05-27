import type { EvidenceValue } from "../schemas/Evidence";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import {
  storefrontProductDraftSchema,
  type StorefrontProductDraft,
  type StorefrontReadinessStatus,
} from "../schemas/StorefrontProduct";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return slug || "product";
}

function evidence<T>(value: T, base: Omit<EvidenceValue<T>, "value">): EvidenceValue<T> {
  return { value, ...base };
}

function firstExtractedImage(report: ProductResearchReport) {
  return report.extracted.images?.value?.[0];
}

function determineReadiness(report: ProductResearchReport): {
  status: StorefrontReadinessStatus;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (!report.agentDecision?.selectedUrl && !report.selectedCanonicalUrl) {
    missingFields.push("canonicalUrl");
  }

  if (!report.extracted.description?.value) {
    missingFields.push("description");
  }

  if (!firstExtractedImage(report)) {
    missingFields.push("images");
  }

  if (report.status === "needs_more_candidates") {
    return { status: "blocked", missingFields };
  }

  if (report.status === "completed" && missingFields.length === 0) {
    return { status: "ready", missingFields };
  }

  return { status: "needs_review", missingFields };
}

export function assembleStorefrontProductDraft(
  report: ProductResearchReport,
  options: { generatedAt?: Date } = {},
): StorefrontProductDraft {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const titleEvidence = report.productIdentity.registerName
    ?? evidence(report.input.registerName, {
      confidence: 1,
      sourceType: "input",
      evidence: "Register name was supplied as part of the research request.",
    });
  const brandEvidence = report.productIdentity.brand
    ?? evidence(report.input.brand, {
      confidence: 1,
      sourceType: "input",
      evidence: "Brand was supplied as part of the research request.",
    });
  const selectedUrl = report.agentDecision?.selectedUrl ?? report.selectedCanonicalUrl;
  const readiness = determineReadiness(report);
  const imageUrl = firstExtractedImage(report);
  const sourceUrls = Array.from(
    new Set([
      selectedUrl,
      ...report.candidates.slice(0, 5).map((candidate) => candidate.normalizedUrl),
    ].filter((url): url is string => Boolean(url))),
  );

  const productType = report.extracted.categories?.value?.[0];
  const tags = Array.from(new Set([
    report.input.brand,
    productType,
    report.productIdentity.size?.value,
    report.productIdentity.flavor?.value,
    report.productIdentity.variant?.value,
  ].filter((tag): tag is string => Boolean(tag))));

  return storefrontProductDraftSchema.parse({
    productId: report.input.productId,
    generatedAt,
    readiness: {
      status: readiness.status,
      confidence: report.confidence.overall,
      missingFields: readiness.missingFields,
      warnings: report.warnings,
    },
    identity: {
      title: titleEvidence,
      brand: brandEvidence,
      ...(selectedUrl
        ? {
            canonicalUrl: evidence(selectedUrl, {
              confidence: report.agentDecision ? (report.agentDecision.confidence ?? 0.7) : report.confidence.overall,
              sourceType: report.agentDecision ? "manual" : "candidate",
              sourceUrl: selectedUrl,
              evidence: report.agentDecision?.rationale ?? "Selected by deterministic candidate scoring.",
            }),
          }
        : {}),
      ...(report.productIdentity.upc ? { upc: report.productIdentity.upc } : {}),
    },
    listing: {
      handle: slugify(titleEvidence.value),
      ...(productType
        ? {
            productType: evidence(productType, {
              confidence: report.extracted.categories?.confidence ?? 0.6,
              sourceType: report.extracted.categories?.sourceType ?? "heuristic",
              sourceUrl: report.extracted.categories?.sourceUrl,
              evidence: report.extracted.categories?.evidence ?? "Derived from extracted category evidence.",
            }),
            category: evidence(productType, {
              confidence: report.extracted.categories?.confidence ?? 0.6,
              sourceType: report.extracted.categories?.sourceType ?? "heuristic",
              sourceUrl: report.extracted.categories?.sourceUrl,
              evidence: report.extracted.categories?.evidence ?? "Derived from extracted category evidence.",
            }),
          }
        : {}),
      ...(report.extracted.description
        ? {
            descriptionText: report.extracted.description,
            descriptionHtml: evidence(`<p>${report.extracted.description.value}</p>`, {
              confidence: report.extracted.description.confidence,
              sourceType: report.extracted.description.sourceType,
              sourceUrl: report.extracted.description.sourceUrl,
              evidence: report.extracted.description.evidence,
            }),
          }
        : {}),
      ...(tags.length
        ? {
            tags: evidence(tags, {
              confidence: 0.7,
              sourceType: "heuristic",
              evidence: "Tags were assembled from brand, category, and expected product attributes.",
            }),
          }
        : {}),
    },
    media: {
      images: imageUrl
        ? [
            {
              url: imageUrl,
              altText: titleEvidence.value,
              sourceUrl: report.extracted.images?.sourceUrl,
              confidence: report.extracted.images?.confidence ?? 0.6,
            },
          ]
        : [],
    },
    variants: [
      {
        title: "Default Title",
        barcode: report.productIdentity.upc?.value,
        optionValues: {
          ...(report.productIdentity.size?.value ? { Size: report.productIdentity.size.value } : {}),
          ...(report.productIdentity.flavor?.value ? { Flavor: report.productIdentity.flavor.value } : {}),
          ...(report.productIdentity.variant?.value ? { Variant: report.productIdentity.variant.value } : {}),
        },
        attributes: report.extracted.attributes?.value ?? {},
      },
    ],
    attributes: report.extracted.attributes,
    seo: {
      title: titleEvidence.value,
      description: report.extracted.description?.value,
    },
    provenance: {
      reportRunId: report.runId,
      sourceUrls,
      agentDecisionUrl: report.agentDecision?.selectedUrl,
    },
  });
}
