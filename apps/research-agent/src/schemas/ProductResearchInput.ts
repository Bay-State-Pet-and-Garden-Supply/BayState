import { z } from "zod";
import { candidateUrlInputSchema } from "./CandidateUrl";

const seedCandidateUrlsSchema = z.array(candidateUrlInputSchema);

const productResearchInputFieldsSchema = z.object({
  productId: z.string().trim().min(1),
  upc: z.string().trim().min(1),
  registerName: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  officialDomain: z.string().trim().min(1).optional(),
  officialWebsiteUrl: z.string().url().optional(),
  seedCandidateUrls: seedCandidateUrlsSchema.default([]),
  notes: z.string().trim().min(1).optional(),
});

function normalizeLegacyInput(rawInput: unknown) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return rawInput;
  }

  const input = rawInput as Record<string, unknown>;
  return {
    ...input,
    seedCandidateUrls:
      input.seedCandidateUrls ?? (Array.isArray(input.candidateUrls) ? input.candidateUrls : undefined),
  };
}

function requireOfficialDomainSource(
  input: { officialDomain?: string; officialWebsiteUrl?: string; officialDomainResolved?: string },
  ctx: z.RefinementCtx,
) {
  if (!input.officialDomain && !input.officialWebsiteUrl && !input.officialDomainResolved) {
    ctx.addIssue({
      code: "custom",
      path: ["officialDomain"],
      message: "Product research requires an official brand domain or official website URL for candidate discovery.",
    });
  }
}

const productResearchInputObjectSchema = productResearchInputFieldsSchema.superRefine(
  requireOfficialDomainSource,
);

export const productResearchInputSchema = z.preprocess(
  normalizeLegacyInput,
  productResearchInputObjectSchema,
);

export type ProductResearchInput = z.infer<typeof productResearchInputSchema>;

export const resolvedProductResearchInputSchema = productResearchInputFieldsSchema
  .extend({
    officialDomainResolved: z.string().trim().min(1).optional(),
  })
  .superRefine(requireOfficialDomainSource);

export type ResolvedProductResearchInput = z.infer<
  typeof resolvedProductResearchInputSchema
>;
