import { readFile } from "node:fs/promises";
import { z } from "zod";

const serperOrganicResultSchema = z.object({
  title: z.string().trim().min(1).optional(),
  link: z.string().trim().min(1).optional(),
  snippet: z.string().trim().min(1).optional(),
});

const serperResponseSchema = z.object({
  organic: z.array(serperOrganicResultSchema).optional(),
  knowledgeGraph: z.object({
    title: z.string().trim().min(1).optional(),
    website: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
  }).optional(),
});

const searchFixtureSchema = z.object({
  query: z.string().trim().min(1),
  response: serperResponseSchema,
});

const serperStrategyEvalEntrySchema = z.object({
  id: z.string().trim().min(1),
  upc: z.string().trim().min(1),
  registerName: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  officialDomain: z.string().trim().min(1),
  expectedPredictedName: z.string().trim().min(1),
  expectedProductUrl: z.string().trim().min(1),
  searchFixtures: z.array(searchFixtureSchema).min(1),
  notes: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

const serperStrategyEvalDatasetSchema = z.object({
  schemaVersion: z.literal("research-agent-serper-strategy-eval-v1"),
  entries: z.array(serperStrategyEvalEntrySchema).min(1),
});

export type SerperStrategyEvalEntry = z.infer<typeof serperStrategyEvalEntrySchema>;
export type SerperStrategyEvalDataset = z.infer<typeof serperStrategyEvalDatasetSchema>;

export async function loadSerperStrategyEvalDataset(datasetPath: string): Promise<SerperStrategyEvalDataset> {
  const raw = JSON.parse(await readFile(datasetPath, "utf8")) as unknown;
  return serperStrategyEvalDatasetSchema.parse(raw);
}
