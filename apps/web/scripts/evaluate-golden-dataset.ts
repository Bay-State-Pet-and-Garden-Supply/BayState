import fs from 'fs/promises';
import path from 'path';
import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import { createBatchContent } from '@/lib/consolidation';
import {
  compareConsolidationResults,
  summarizeComparisons,
  type ConsolidationResult,
  type ParallelRunComparison,
} from '@/lib/consolidation';
import { buildPromptContext, getCategories } from '@/lib/consolidation/prompt-builder';
import {
  getConsolidationConfig,
  getGeminiClient,
} from '@/lib/consolidation/openai-client';
import {
  normalizeConsolidationResult,
  parseJsonResponse,
} from '@/lib/consolidation/result-normalizer';
import {
  buildResponseSchema,
  validateConsolidationTaxonomy,
  validateRequiredConsolidationFields,
} from '@/lib/consolidation/taxonomy-validator';
import {
  formatPercent,
  parseIntegerOption,
  readJsonLines,
  resolveScriptPath,
  type GoldenDatasetRecord,
} from './gemini-migration-utils';

interface EvaluationOptions {
  inputPath: string;
  outputPath: string | null;
  providers: LLMProvider[];
  limit: number;
}

interface ProviderExecutionResult {
  sku: string;
  provider: LLMProvider;
  output?: Partial<ConsolidationResult>;
  comparison?: ParallelRunComparison;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

function printUsage(): void {
  console.log(`
Usage:
  cd apps/web && bun scripts/evaluate-golden-dataset.ts [options]

Options:
  --input <path>       Dataset JSONL path (default: tests/fixtures/golden-dataset.jsonl)
  --output <path>      Optional JSON report path
  --providers <csv>    Provider list (default: openai,gemini)
  --limit <number>     Number of records to evaluate (default: 10)
  --help
`.trim());
}

function parseProviders(value: string | undefined): LLMProvider[] {
  const providers = (value ?? 'openai,gemini')
    .split(',')
    .map((provider) => provider.trim())
    .filter((provider): provider is LLMProvider =>
      provider === 'openai' || provider === 'openai_compatible' || provider === 'gemini'
    );

  if (providers.length === 0) {
    throw new Error('Expected at least one provider in --providers');
  }

  return Array.from(new Set(providers));
}

function parseArgs(argv: string[]): EvaluationOptions {
  const options: EvaluationOptions = {
    inputPath: resolveScriptPath('tests/fixtures/golden-dataset.jsonl'),
    outputPath: null,
    providers: ['openai', 'gemini'],
    limit: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--input':
        options.inputPath = resolveScriptPath(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--output':
        options.outputPath = resolveScriptPath(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--providers':
        options.providers = parseProviders(argv[index + 1]);
        index += 1;
        break;
      case '--limit':
        options.limit = parseIntegerOption(arg, argv[index + 1], 10);
        index += 1;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function extractPromptPayload(
  record: GoldenDatasetRecord,
  provider: LLMProvider,
  systemPrompt: string,
  responseSchema: object,
  config: {
    model: string;
    maxTokens: number;
    temperature: number;
  }
): Record<string, unknown> {
  const content = createBatchContent(
    [record.product],
    systemPrompt,
    responseSchema,
    {
      provider,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    }
  ).trim();

  return JSON.parse(content) as Record<string, unknown>;
}

async function runOpenAICompatibleEvaluation(
  provider: LLMProvider,
  record: GoldenDatasetRecord,
  payload: Record<string, unknown>,
  config: Awaited<ReturnType<typeof getConsolidationConfig>>,
): Promise<{ text: string; usage?: ProviderExecutionResult['usage'] }> {
  const body = payload.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`Malformed ${provider} request body for ${record.sku}`);
  }

  const baseUrl = provider === 'openai_compatible'
    ? config.llm_base_url?.replace(/\/$/, '') ?? null
    : 'https://api.openai.com/v1';

  if (!baseUrl || !config.llm_api_key) {
    throw new Error(`${provider} runtime is not configured`);
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.llm_api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${provider} request failed for ${record.sku}: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === 'object'
    ? (firstChoice as { message?: Record<string, unknown> }).message
    : undefined;
  const text = typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content
        .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string')
          ? (part as { text: string }).text
          : '')
        .join('')
      : '';

  return {
    text,
    usage: {
      prompt_tokens: typeof (raw.usage as { prompt_tokens?: unknown } | undefined)?.prompt_tokens === 'number'
        ? (raw.usage as { prompt_tokens: number }).prompt_tokens
        : undefined,
      completion_tokens: typeof (raw.usage as { completion_tokens?: unknown } | undefined)?.completion_tokens === 'number'
        ? (raw.usage as { completion_tokens: number }).completion_tokens
        : undefined,
      total_tokens: typeof (raw.usage as { total_tokens?: unknown } | undefined)?.total_tokens === 'number'
        ? (raw.usage as { total_tokens: number }).total_tokens
        : undefined,
    },
  };
}

async function runGeminiEvaluation(
  record: GoldenDatasetRecord,
  payload: Record<string, unknown>,
  config: Awaited<ReturnType<typeof getConsolidationConfig>>,
  responseSchema: object,
): Promise<{ text: string; usage?: ProviderExecutionResult['usage'] }> {
  const request = payload.request;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error(`Malformed Gemini request body for ${record.sku}`);
  }

  const contents = Array.isArray((request as { contents?: unknown[] }).contents)
    ? ((request as { contents: Array<{ parts?: Array<{ text?: string }> }> }).contents)
    : [];
  const prompt = contents[0]?.parts?.[0]?.text;
  const systemInstruction = Array.isArray(
    ((request as { system_instruction?: { parts?: Array<{ text?: string }> } }).system_instruction?.parts)
  )
    ? ((request as { system_instruction?: { parts?: Array<{ text?: string }> } }).system_instruction?.parts?.[0]?.text)
    : undefined;

  if (!prompt) {
    throw new Error(`Missing Gemini prompt for ${record.sku}`);
  }

  const client = await getGeminiClient({ forceProvider: 'gemini', routingKey: 'consolidation_eval' });
  if (!client) {
    throw new Error('Gemini runtime is not configured');
  }

  const response = await client.generate({
    model: config.model,
    prompt,
    systemInstruction,
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens,
    responseJsonSchema: responseSchema,
    responseMimeType: 'application/json',
  });

  return {
    text: response.text,
    usage: {
      prompt_tokens: response.usage?.promptTokens,
      completion_tokens: response.usage?.completionTokens,
      total_tokens: response.usage?.totalTokens,
    },
  };
}

function normalizeModelOutput(
  rawText: string,
  categories: string[],
  shopsitePages: string[]
): Partial<ConsolidationResult> {
  const parsed = parseJsonResponse(rawText);
  if (!parsed) {
    throw new Error('Model response did not contain valid JSON');
  }

  const requiredFields = validateRequiredConsolidationFields(parsed);
  const normalized = normalizeConsolidationResult(requiredFields, shopsitePages);
  return validateConsolidationTaxonomy(normalized, categories) as Partial<ConsolidationResult>;
}

async function evaluateProvider(
  provider: LLMProvider,
  records: GoldenDatasetRecord[],
  context: {
    systemPrompt: string;
    responseSchema: object;
    categories: string[];
    shopsitePages: string[];
  }
): Promise<ProviderExecutionResult[]> {
  const config = await getConsolidationConfig({
    forceProvider: provider,
    routingKey: 'consolidation_eval',
  });

  const results: ProviderExecutionResult[] = [];
  for (const record of records) {
    try {
      const payload = extractPromptPayload(record, provider, context.systemPrompt, context.responseSchema, config);
      const execution = provider === 'gemini'
        ? await runGeminiEvaluation(record, payload, config, context.responseSchema)
        : await runOpenAICompatibleEvaluation(provider, record, payload, config);
      const output = normalizeModelOutput(execution.text, context.categories, context.shopsitePages);
      const comparison = compareConsolidationResults(record.expected_output, output);

      results.push({
        sku: record.sku,
        provider,
        output,
        comparison,
        usage: execution.usage,
      });
    } catch (error) {
      results.push({
        sku: record.sku,
        provider,
        error: error instanceof Error ? error.message : `Failed to evaluate ${provider}`,
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const records = (await readJsonLines<GoldenDatasetRecord>(options.inputPath)).slice(0, options.limit);

  if (records.length === 0) {
    throw new Error('No dataset records found to evaluate');
  }

  const [{ systemPrompt, shopsitePages = [] }, categoryList] = await Promise.all([
    buildPromptContext(),
    getCategories(),
  ]);
  const categories = categoryList.map((category) => category.name);
  const responseSchema = buildResponseSchema(categories, shopsitePages);

  const providerResultsEntries = await Promise.all(
    options.providers.map(async (provider) => [
      provider,
      await evaluateProvider(provider, records, {
        systemPrompt,
        responseSchema,
        categories,
        shopsitePages,
      }),
    ] as const)
  );

  const providerResults = Object.fromEntries(providerResultsEntries);
  const providerSummaries = Object.fromEntries(
    providerResultsEntries.map(([provider, results]) => {
      const comparisons = results
        .map((result) => result.comparison)
        .filter((comparison): comparison is ParallelRunComparison => Boolean(comparison));

      return [provider, {
        completed: comparisons.length,
        failed: results.filter((result) => Boolean(result.error)).length,
        summary: summarizeComparisons(comparisons),
        avg_accuracy: comparisons.length > 0 ? formatPercent(summarizeComparisons(comparisons).accuracy) : 'n/a',
      }];
    })
  );

  const pairwiseComparisons = options.providers.length >= 2
    ? records.map((record) => {
      const left = providerResults[options.providers[0]].find((result) => result.sku === record.sku);
      const right = providerResults[options.providers[1]].find((result) => result.sku === record.sku);

      if (!left?.output || !right?.output) {
        return {
          sku: record.sku,
          error: 'Missing comparable outputs',
        };
      }

      return {
        sku: record.sku,
        comparison: compareConsolidationResults(left.output, right.output),
      };
    })
    : [];

  const report = {
    input_path: options.inputPath,
    evaluated_count: records.length,
    providers: options.providers,
    provider_summaries: providerSummaries,
    pairwise_comparison_summary:
      pairwiseComparisons.length > 0
        ? summarizeComparisons(
          pairwiseComparisons
            .map((entry) => ('comparison' in entry ? entry.comparison : null))
            .filter((entry): entry is ParallelRunComparison => entry !== null)
        )
        : null,
    provider_results: providerResults,
  };

  const output = JSON.stringify(report, null, 2);
  console.log(output);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${output}\n`, 'utf8');
  }
}

main().catch((error) => {
  console.error('[Evaluate Golden Dataset] Failed:', error);
  printUsage();
  process.exit(1);
});
