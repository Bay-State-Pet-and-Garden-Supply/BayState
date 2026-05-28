import { z } from "zod";
import { createEvidenceValueSchema } from "./Evidence";

const stringEvidenceSchema = createEvidenceValueSchema(z.string());
const stringArrayEvidenceSchema = createEvidenceValueSchema(z.array(z.string()));
const unknownRecordSchema = z.record(z.string(), z.unknown());
const recordEvidenceSchema = createEvidenceValueSchema(unknownRecordSchema);

const storefrontReadinessStatusSchema = z.enum([
  "ready",
  "needs_review",
  "blocked",
]);

export type StorefrontReadinessStatus = z.infer<typeof storefrontReadinessStatusSchema>;

const storefrontImageSchema = z.object({
  url: z.string().url(),
  altText: z.string().trim().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type StorefrontImage = z.infer<typeof storefrontImageSchema>;

const storefrontVariantDraftSchema = z.object({
  title: z.string().trim().min(1).default("Default Title"),
  sku: z.string().trim().min(1).optional(),
  barcode: z.string().trim().min(1).optional(),
  optionValues: z.record(z.string(), z.string()).default({}),
  price: z.string().trim().min(1).optional(),
  compareAtPrice: z.string().trim().min(1).optional(),
  attributes: unknownRecordSchema.default({}),
});

export type StorefrontVariantDraft = z.infer<typeof storefrontVariantDraftSchema>;

export const storefrontProductDraftSchema = z.object({
  productId: z.string().trim().min(1),
  generatedAt: z.string().datetime(),
  readiness: z.object({
    status: storefrontReadinessStatusSchema,
    confidence: z.number().min(0).max(1),
    missingFields: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),
  identity: z.object({
    title: stringEvidenceSchema,
    brand: stringEvidenceSchema,
    canonicalUrl: stringEvidenceSchema.optional(),
    upc: stringEvidenceSchema.optional(),
  }),
  listing: z.object({
    handle: z.string().trim().min(1),
    productType: stringEvidenceSchema.optional(),
    category: stringEvidenceSchema.optional(),
    descriptionText: stringEvidenceSchema.optional(),
    descriptionHtml: stringEvidenceSchema.optional(),
    tags: stringArrayEvidenceSchema.optional(),
  }),
  media: z.object({
    images: z.array(storefrontImageSchema).default([]),
  }),
  variants: z.array(storefrontVariantDraftSchema).min(1),
  attributes: recordEvidenceSchema.optional(),
  seo: z.object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
  }).default({}),
  provenance: z.object({
    reportRunId: z.string().trim().min(1),
    sourceUrls: z.array(z.string().url()).default([]),
    agentDecisionUrl: z.string().url().optional(),
  }),
});

export type StorefrontProductDraft = z.infer<typeof storefrontProductDraftSchema>;
