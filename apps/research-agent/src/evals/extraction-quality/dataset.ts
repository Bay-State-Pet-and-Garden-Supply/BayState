import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const extractionQualityEvalExpectedSchema = z.object({
  title: z.string().trim().min(1).optional(),
  descriptionContains: z.array(z.string().trim().min(1)).optional(),
  categoriesInclude: z.array(z.string().trim().min(1)).optional(),
  requiredImages: z.array(z.string().trim().min(1)).optional(),
  forbiddenImages: z.array(z.string().trim().min(1)).optional(),
  minImageCount: z.number().int().nonnegative().optional(),
  maxImageCount: z.number().int().nonnegative().optional(),
  requiredAttributes: z.record(z.string(), z.string().trim().min(1)).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

const extractionQualityEvalPageSchema = z.object({
  url: z.string().trim().min(1),
  finalUrl: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  htmlPath: z.string().trim().min(1),
  textPath: z.string().trim().min(1).optional(),
});

const extractionQualityEvalInputSchema = z.object({
  productId: z.string().trim().min(1),
  upc: z.string().trim().min(1),
  registerName: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  officialDomain: z.string().trim().min(1).optional(),
  officialWebsiteUrl: z.string().trim().min(1).optional(),
});

const extractionQualityEvalEntrySchema = z.object({
  id: z.string().trim().min(1),
  input: extractionQualityEvalInputSchema,
  page: extractionQualityEvalPageSchema,
  expected: extractionQualityEvalExpectedSchema,
  notes: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

const extractionQualityEvalDatasetSchema = z.object({
  schemaVersion: z.literal("research-agent-extraction-quality-eval-v1"),
  entries: z.array(extractionQualityEvalEntrySchema).min(1),
});

export type ExtractionQualityEvalEntry = z.infer<typeof extractionQualityEvalEntrySchema> & {
  page: z.infer<typeof extractionQualityEvalPageSchema> & {
    html: string;
    text?: string;
  };
};

export type ExtractionQualityEvalDataset = {
  schemaVersion: "research-agent-extraction-quality-eval-v1";
  entries: ExtractionQualityEvalEntry[];
};

export async function loadExtractionQualityEvalDataset(datasetPath: string): Promise<ExtractionQualityEvalDataset> {
  const raw = JSON.parse(await readFile(datasetPath, "utf8")) as unknown;
  const parsed = extractionQualityEvalDatasetSchema.parse(raw);
  const datasetDir = path.dirname(datasetPath);

  const entries = await Promise.all(parsed.entries.map(async (entry) => {
    const html = await readFile(path.resolve(datasetDir, entry.page.htmlPath), "utf8");
    const text = entry.page.textPath
      ? await readFile(path.resolve(datasetDir, entry.page.textPath), "utf8")
      : undefined;

    return {
      ...entry,
      page: {
        ...entry.page,
        html,
        ...(text ? { text } : {}),
      },
    } satisfies ExtractionQualityEvalEntry;
  }));

  return {
    schemaVersion: parsed.schemaVersion,
    entries,
  };
}
