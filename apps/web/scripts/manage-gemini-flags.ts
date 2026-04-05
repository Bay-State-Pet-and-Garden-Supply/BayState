import {
  DEFAULT_GEMINI_FEATURE_FLAGS,
  getGeminiFeatureFlagsSafe,
  upsertGeminiFeatureFlags,
  type GeminiFeatureFlags,
} from '@/lib/config/gemini-feature-flags';

interface ScriptOptions {
  getOnly: boolean;
  reason: string | null;
  source: string;
  updatedBy: string | null;
  patch: Partial<GeminiFeatureFlags>;
}

function printUsage(): void {
  console.log(`
Usage:
  bun scripts/manage-gemini-flags.ts [options]

Options:
  --get
  --enable-ai-search <true|false>
  --enable-crawl4ai <true|false>
  --enable-batch <true|false>
  --enable-parallel <true|false>
  --traffic-percent <1-100>
  --parallel-sample-percent <1-100>
  --reason <text>
  --source <text>
  --updated-by <text>
  --help
`.trim());
}

function parseBoolean(flag: string, value: string | undefined): boolean {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`Expected true or false for ${flag}`);
}

function parsePercent(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid percent for ${flag}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    getOnly: false,
    reason: null,
    source: 'script',
    updatedBy: 'script',
    patch: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--get':
        options.getOnly = true;
        break;
      case '--enable-ai-search':
        options.patch.GEMINI_AI_SEARCH_ENABLED = parseBoolean(arg, argv[index + 1]);
        index += 1;
        break;
      case '--enable-crawl4ai':
        options.patch.GEMINI_CRAWL4AI_ENABLED = parseBoolean(arg, argv[index + 1]);
        index += 1;
        break;
      case '--enable-batch':
        options.patch.GEMINI_BATCH_ENABLED = parseBoolean(arg, argv[index + 1]);
        index += 1;
        break;
      case '--enable-parallel':
        options.patch.GEMINI_PARALLEL_RUN_ENABLED = parseBoolean(arg, argv[index + 1]);
        index += 1;
        break;
      case '--traffic-percent':
        options.patch.GEMINI_TRAFFIC_PERCENT = parsePercent(arg, argv[index + 1]);
        index += 1;
        break;
      case '--parallel-sample-percent':
        options.patch.GEMINI_PARALLEL_SAMPLE_PERCENT = parsePercent(arg, argv[index + 1]);
        index += 1;
        break;
      case '--reason':
        options.reason = argv[index + 1] ?? null;
        index += 1;
        break;
      case '--source':
        options.source = argv[index + 1] ?? 'script';
        index += 1;
        break;
      case '--updated-by':
        options.updatedBy = argv[index + 1] ?? 'script';
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.getOnly || Object.keys(options.patch).length === 0) {
    const current = await getGeminiFeatureFlagsSafe();
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  const next = await upsertGeminiFeatureFlags(options.patch, options.updatedBy, {
    reason: options.reason,
    source: options.source,
  });

  console.log(JSON.stringify({
    previous_defaults: DEFAULT_GEMINI_FEATURE_FLAGS,
    next,
  }, null, 2));
}

main().catch((error) => {
  console.error('[Manage Gemini Flags] Failed:', error);
  printUsage();
  process.exit(1);
});
