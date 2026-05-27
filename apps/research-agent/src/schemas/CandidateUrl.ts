import { z } from "zod";

export const candidateSourceTypeSchema = z.enum([
  "input",
  "official",
  "sitemap",
  "serp",
  "distributor",
  "unknown",
]);

export type CandidateSourceType = z.infer<typeof candidateSourceTypeSchema>;

export const candidateDecisionSchema = z.enum([
  "selected",
  "rejected",
  "needs_review",
]);

export type CandidateDecision = z.infer<typeof candidateDecisionSchema>;

export const candidateUrlInputSchema = z.object({
  url: z.string().url(),
  sourceType: candidateSourceTypeSchema.default("input"),
  title: z.string().trim().min(1).optional(),
  snippet: z.string().trim().min(1).optional(),
  discoveredFrom: z.string().trim().min(1).optional(),
});

export type CandidateUrlInput = z.infer<typeof candidateUrlInputSchema>;

export const evaluatedCandidateSchema = candidateUrlInputSchema.extend({
  normalizedUrl: z.string().url(),
  normalizedDomain: z.string().min(1),
  matchedTokens: z.array(z.string()),
  score: z.number().min(0).max(1),
  authorityScore: z.number().min(0).max(1),
  relevanceScore: z.number().min(0).max(1),
  variantScore: z.number().min(0).max(1),
  pathScore: z.number().min(0).max(1),
  decision: candidateDecisionSchema,
  reason: z.string().min(1),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type EvaluatedCandidate = z.infer<typeof evaluatedCandidateSchema>;
