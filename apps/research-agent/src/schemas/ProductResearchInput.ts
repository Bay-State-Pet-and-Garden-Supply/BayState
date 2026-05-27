import { z } from "zod";
import { candidateUrlInputSchema } from "./CandidateUrl";

export const expectedAttributesSchema = z.object({
  size: z.string().trim().min(1).optional(),
  flavor: z.string().trim().min(1).optional(),
  variant: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
});

export type ExpectedAttributes = z.infer<typeof expectedAttributesSchema>;

export const productResearchInputSchema = z.object({
  productId: z.string().trim().min(1),
  upc: z.string().trim().min(1).optional(),
  registerName: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  officialDomain: z.string().trim().min(1).optional(),
  officialWebsiteUrl: z.string().url().optional(),
  candidateUrls: z.array(candidateUrlInputSchema).default([]),
  expectedAttributes: expectedAttributesSchema.default({}),
  notes: z.string().trim().min(1).optional(),
});

export type ProductResearchInput = z.infer<typeof productResearchInputSchema>;

export const resolvedProductResearchInputSchema = productResearchInputSchema.extend({
  officialDomainResolved: z.string().trim().min(1).optional(),
});

export type ResolvedProductResearchInput = z.infer<
  typeof resolvedProductResearchInputSchema
>;
