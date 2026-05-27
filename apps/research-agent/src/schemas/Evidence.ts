import { z } from "zod";

export const evidenceSourceTypeSchema = z.enum([
  "input",
  "candidate",
  "heuristic",
  "jsonld",
  "meta",
  "scraper",
  "manual",
]);

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export interface EvidenceValue<T> {
  value: T;
  confidence: number;
  sourceType: EvidenceSourceType;
  sourceUrl?: string;
  evidence: string;
}

export function createEvidenceValueSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
    sourceType: evidenceSourceTypeSchema,
    sourceUrl: z.string().url().optional(),
    evidence: z.string().min(1),
  });
}
