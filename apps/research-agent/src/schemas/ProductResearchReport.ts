import { z } from "zod";
import { createEvidenceValueSchema } from "./Evidence";
import { evaluatedCandidateSchema } from "./CandidateUrl";
import { resolvedProductResearchInputSchema } from "./ProductResearchInput";

const stringEvidenceSchema = createEvidenceValueSchema(z.string());
const stringArrayEvidenceSchema = createEvidenceValueSchema(z.array(z.string()));
const recordEvidenceSchema = createEvidenceValueSchema(z.record(z.string(), z.unknown()));

export const productResearchStatusSchema = z.enum([
  "completed",
  "needs_review",
  "needs_more_candidates",
]);

export type ProductResearchStatus = z.infer<typeof productResearchStatusSchema>;

export const extractedResearchFieldsSchema = z.object({
  description: stringEvidenceSchema.optional(),
  images: stringArrayEvidenceSchema.optional(),
  categories: stringArrayEvidenceSchema.optional(),
  attributes: recordEvidenceSchema.optional(),
});

export type ExtractedResearchFields = z.infer<
  typeof extractedResearchFieldsSchema
>;

export const agentCandidateDecisionSchema = z.object({
  selectedUrl: z.string().url().optional(),
  rationale: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).optional(),
  defer: z.boolean(),
  recordedAt: z.string().datetime(),
  source: z.literal("pi_harness"),
});

export type AgentCandidateDecision = z.infer<typeof agentCandidateDecisionSchema>;

export const productResearchReportSchema = z.object({
  runId: z.string().min(1),
  status: productResearchStatusSchema,
  generatedAt: z.string().datetime(),
  input: resolvedProductResearchInputSchema,
  selectedCanonicalUrl: z.string().url().optional(),
  productIdentity: z.object({
    brand: stringEvidenceSchema.optional(),
    registerName: stringEvidenceSchema.optional(),
    upc: stringEvidenceSchema.optional(),
    size: stringEvidenceSchema.optional(),
    flavor: stringEvidenceSchema.optional(),
    variant: stringEvidenceSchema.optional(),
  }),
  extracted: extractedResearchFieldsSchema,
  candidates: z.array(evaluatedCandidateSchema),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    identityMatch: z.number().min(0).max(1),
    variantMatch: z.number().min(0).max(1),
    extractionCompleteness: z.number().min(0).max(1),
    sourceAuthority: z.number().min(0).max(1),
  }),
  warnings: z.array(z.string()),
  nextActions: z.array(z.string()),
  agentDecision: agentCandidateDecisionSchema.optional(),
  artifacts: z
    .object({
      artifactDir: z.string().min(1),
      inputPath: z.string().min(1),
      reportPath: z.string().min(1),
      summaryPath: z.string().min(1),
      storefrontProductPath: z.string().min(1).optional(),
    })
    .optional(),
});

export type ProductResearchReport = z.infer<typeof productResearchReportSchema>;
