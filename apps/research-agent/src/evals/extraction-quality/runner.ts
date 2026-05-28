import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DefaultBriefBuilder } from "../../pipeline/brief/brief-builder";
import { CompositeProductFactExtractor } from "../../pipeline/extraction/product-fact-extractor";
import { JsonLdExtractor } from "../../pipeline/extraction/jsonld-extractor";
import { MetaExtractor } from "../../pipeline/extraction/meta-extractor";
import { ProductDomExtractor } from "../../pipeline/extraction/product-dom-extractor";
import { TextHeuristicExtractor } from "../../pipeline/extraction/text-heuristic-extractor";
import type { AcquiredPage, PageFactSet } from "../../pipeline/types";
import { loadExtractionQualityEvalDataset, type ExtractionQualityEvalEntry } from "./dataset";

export interface ExtractionQualityEvalRow {
  id: string;
  titlePass: boolean;
  descriptionScore: number;
  categoriesScore: number;
  requiredImagesPass: boolean;
  forbiddenImagesPass: boolean;
  imageCountPass: boolean;
  attributeScore: number;
  confidencePass: boolean;
  overallPass: boolean;
  actual: {
    title?: string;
    description?: string;
    images: string[];
    categories: string[];
    attributes: Record<string, unknown>;
    confidence: number;
  };
  expected: ExtractionQualityEvalEntry["expected"];
}

export interface ExtractionQualityEvalSummary {
  totalEntries: number;
  overallPassRate: number;
  titlePassRate: number;
  averageDescriptionScore: number;
  averageCategoriesScore: number;
  requiredImagesPassRate: number;
  forbiddenImagesPassRate: number;
  imageCountPassRate: number;
  averageAttributeScore: number;
  confidencePassRate: number;
}

export interface ExtractionQualityEvalReport {
  schemaVersion: "research-agent-extraction-quality-eval-report-v1";
  benchmarkType: "research_agent_extraction_quality";
  generatedAt: string;
  datasetPath: string;
  summary: ExtractionQualityEvalSummary;
  entries: ExtractionQualityEvalRow[];
}

export interface RunExtractionQualityEvalOptions {
  datasetPath: string;
  outputDir: string;
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function rate<T>(items: T[], predicate: (item: T) => boolean) {
  return items.length ? items.filter(predicate).length / items.length : 0;
}

function average<T>(items: T[], selector: (item: T) => number) {
  return items.length ? items.reduce((sum, item) => sum + selector(item), 0) / items.length : 0;
}

function scoreDescription(actual: string | undefined, expected: string[] | undefined) {
  if (!expected?.length) return 1;
  const normalizedActual = normalizeText(actual);
  if (!normalizedActual) return 0;
  return expected.filter((phrase) => normalizedActual.includes(normalizeText(phrase))).length / expected.length;
}

function scoreCategories(actual: string[], expected: string[] | undefined) {
  if (!expected?.length) return 1;
  const normalizedActual = new Set(actual.map((value) => normalizeText(value)));
  return expected.filter((value) => normalizedActual.has(normalizeText(value))).length / expected.length;
}

function passRequiredImages(actual: string[], expected: string[] | undefined) {
  if (!expected?.length) return true;
  const normalizedActual = actual.map((value) => normalizeText(value));
  return expected.every((fragment) => normalizedActual.some((value) => value.includes(normalizeText(fragment))));
}

function passForbiddenImages(actual: string[], forbidden: string[] | undefined) {
  if (!forbidden?.length) return true;
  const normalizedActual = actual.map((value) => normalizeText(value));
  return forbidden.every((fragment) => normalizedActual.every((value) => !value.includes(normalizeText(fragment))));
}

function passImageCount(actual: string[], minCount: number | undefined, maxCount: number | undefined) {
  if (minCount !== undefined && actual.length < minCount) return false;
  if (maxCount !== undefined && actual.length > maxCount) return false;
  return true;
}

function scoreAttributes(actual: Record<string, unknown>, expected: Record<string, string> | undefined) {
  if (!expected || Object.keys(expected).length === 0) return 1;

  let matches = 0;
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (normalizeText(String(actualValue ?? "")) === normalizeText(expectedValue)) {
      matches += 1;
    }
  }

  return matches / Object.keys(expected).length;
}

async function runSingleEntry(entry: ExtractionQualityEvalEntry): Promise<ExtractionQualityEvalRow> {
  const briefBuilder = new DefaultBriefBuilder();
  const brief = await briefBuilder.buildBrief({
    ...entry.input,
    seedCandidateUrls: [],
  }, { now: new Date() });

  const page: AcquiredPage = {
    url: entry.page.url,
    finalUrl: entry.page.finalUrl ?? entry.page.url,
    fetchedAt: new Date().toISOString(),
    title: entry.page.title,
    html: entry.page.html,
    text: entry.page.text,
    metadata: { fixture: true, benchmark: "extraction-quality" },
  };

  const extractor = new CompositeProductFactExtractor([
    new JsonLdExtractor(),
    new MetaExtractor(),
    new TextHeuristicExtractor(),
    new ProductDomExtractor(),
  ]);

  const facts = await extractor.extractFacts(page, brief, { now: new Date() });
  return scoreEntry(entry, facts);
}

function scoreEntry(entry: ExtractionQualityEvalEntry, facts: PageFactSet): ExtractionQualityEvalRow {
  const expected = entry.expected;
  const titlePass = expected.title
    ? normalizeText(facts.title) === normalizeText(expected.title)
    : true;
  const descriptionScore = scoreDescription(facts.description, expected.descriptionContains);
  const categoriesScore = scoreCategories(facts.categories, expected.categoriesInclude);
  const requiredImagesPass = passRequiredImages(facts.images, expected.requiredImages);
  const forbiddenImagesPass = passForbiddenImages(facts.images, expected.forbiddenImages);
  const imageCountPass = passImageCount(facts.images, expected.minImageCount, expected.maxImageCount);
  const attributeScore = scoreAttributes(facts.attributes, expected.requiredAttributes);
  const confidencePass = expected.minConfidence !== undefined ? facts.confidence >= expected.minConfidence : true;
  const overallPass = titlePass
    && descriptionScore === 1
    && categoriesScore === 1
    && requiredImagesPass
    && forbiddenImagesPass
    && imageCountPass
    && attributeScore === 1
    && confidencePass;

  return {
    id: entry.id,
    titlePass,
    descriptionScore,
    categoriesScore,
    requiredImagesPass,
    forbiddenImagesPass,
    imageCountPass,
    attributeScore,
    confidencePass,
    overallPass,
    actual: {
      title: facts.title,
      description: facts.description,
      images: facts.images,
      categories: facts.categories,
      attributes: facts.attributes,
      confidence: facts.confidence,
    },
    expected,
  };
}

function summarizeRows(rows: ExtractionQualityEvalRow[]): ExtractionQualityEvalSummary {
  return {
    totalEntries: rows.length,
    overallPassRate: rate(rows, (row) => row.overallPass),
    titlePassRate: rate(rows, (row) => row.titlePass),
    averageDescriptionScore: average(rows, (row) => row.descriptionScore),
    averageCategoriesScore: average(rows, (row) => row.categoriesScore),
    requiredImagesPassRate: rate(rows, (row) => row.requiredImagesPass),
    forbiddenImagesPassRate: rate(rows, (row) => row.forbiddenImagesPass),
    imageCountPassRate: rate(rows, (row) => row.imageCountPass),
    averageAttributeScore: average(rows, (row) => row.attributeScore),
    confidencePassRate: rate(rows, (row) => row.confidencePass),
  };
}

function buildMarkdownReport(report: ExtractionQualityEvalReport) {
  const lines = [
    "# Research Agent Extraction Quality Eval",
    "",
    `- Generated At: ${report.generatedAt}`,
    `- Dataset: \`${report.datasetPath}\``,
    `- Overall Pass Rate: ${(report.summary.overallPassRate * 100).toFixed(1)}%`,
    `- Title Pass Rate: ${(report.summary.titlePassRate * 100).toFixed(1)}%`,
    `- Required Images Pass Rate: ${(report.summary.requiredImagesPassRate * 100).toFixed(1)}%`,
    `- Forbidden Images Pass Rate: ${(report.summary.forbiddenImagesPassRate * 100).toFixed(1)}%`,
    "",
    "## Entries",
    "",
  ];

  for (const entry of report.entries) {
    lines.push(`### ${entry.id}`);
    lines.push(`- Overall Pass: ${entry.overallPass ? "yes" : "no"}`);
    lines.push(`- Title Pass: ${entry.titlePass ? "yes" : "no"}`);
    lines.push(`- Description Score: ${entry.descriptionScore.toFixed(2)}`);
    lines.push(`- Categories Score: ${entry.categoriesScore.toFixed(2)}`);
    lines.push(`- Required Images Pass: ${entry.requiredImagesPass ? "yes" : "no"}`);
    lines.push(`- Forbidden Images Pass: ${entry.forbiddenImagesPass ? "yes" : "no"}`);
    lines.push(`- Image Count Pass: ${entry.imageCountPass ? "yes" : "no"}`);
    lines.push(`- Attribute Score: ${entry.attributeScore.toFixed(2)}`);
    lines.push(`- Confidence Pass: ${entry.confidencePass ? "yes" : "no"}`);
    lines.push(`- Actual Images: ${entry.actual.images.join(", ") || "(none)"}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writeReport(report: ExtractionQualityEvalReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "extraction-quality-eval.json");
  const markdownPath = path.join(outputDir, "extraction-quality-eval.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdownReport(report), "utf8");

  return { jsonPath, markdownPath };
}

export async function runExtractionQualityEval(options: RunExtractionQualityEvalOptions) {
  const dataset = await loadExtractionQualityEvalDataset(options.datasetPath);
  const entries = await Promise.all(dataset.entries.map((entry) => runSingleEntry(entry)));

  const report: ExtractionQualityEvalReport = {
    schemaVersion: "research-agent-extraction-quality-eval-report-v1",
    benchmarkType: "research_agent_extraction_quality",
    generatedAt: new Date().toISOString(),
    datasetPath: options.datasetPath,
    summary: summarizeRows(entries),
    entries,
  };

  const { jsonPath, markdownPath } = await writeReport(report, options.outputDir);
  return { report, jsonPath, markdownPath };
}
