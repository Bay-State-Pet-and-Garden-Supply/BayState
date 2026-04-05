import {
  readJsonLines,
  resolveScriptPath,
  type GoldenDatasetRecord,
} from './gemini-migration-utils';

function printUsage(): void {
  console.log(`
Usage:
  cd apps/web && bun scripts/validate-golden-dataset.ts [options]

Options:
  --input <path>         JSONL dataset path (default: tests/fixtures/golden-dataset.jsonl)
  --min-count <number>   Minimum record target (default: 1000)
  --strict               Exit non-zero if validation warnings are present
  --help
`.trim());
}

function parseArgs(argv: string[]): { inputPath: string; minCount: number; strict: boolean } {
  const options = {
    inputPath: resolveScriptPath('tests/fixtures/golden-dataset.jsonl'),
    minCount: 1000,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--input':
        options.inputPath = resolveScriptPath(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--min-count': {
        const value = argv[index + 1];
        const parsed = Number.parseInt(value ?? '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid value for --min-count: ${value}`);
        }
        options.minCount = parsed;
        index += 1;
        break;
      }
      case '--strict':
        options.strict = true;
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

function containsPiiLikeText(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phonePattern = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

  return emailPattern.test(value) || phonePattern.test(value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const records = await readJsonLines<GoldenDatasetRecord>(options.inputPath);

  const seenSkus = new Set<string>();
  const duplicateSkus: string[] = [];
  const invalidRecords: string[] = [];
  let piiWarningCount = 0;

  for (const record of records) {
    if (!record.sku || typeof record.sku !== 'string') {
      invalidRecords.push('Missing sku');
      continue;
    }

    if (seenSkus.has(record.sku)) {
      duplicateSkus.push(record.sku);
    }
    seenSkus.add(record.sku);

    if (!record.product || typeof record.product !== 'object') {
      invalidRecords.push(`${record.sku}: missing product payload`);
      continue;
    }

    if (!record.expected_output || typeof record.expected_output !== 'object') {
      invalidRecords.push(`${record.sku}: missing expected_output`);
      continue;
    }

    if (containsPiiLikeText(record.product_name) || containsPiiLikeText(record.brand)) {
      piiWarningCount += 1;
    }
  }

  const categoryCoverage = new Map<string, number>();
  for (const record of records) {
    const category = record.category ?? 'uncategorized';
    categoryCoverage.set(category, (categoryCoverage.get(category) ?? 0) + 1);
  }

  const warnings: string[] = [];
  if (records.length < options.minCount) {
    warnings.push(
      `Dataset contains ${records.length} records, below the requested ${options.minCount}-record target.`
    );
  }
  if (duplicateSkus.length > 0) {
    warnings.push(`Found ${duplicateSkus.length} duplicate SKU entries.`);
  }
  if (piiWarningCount > 0) {
    warnings.push(`Detected ${piiWarningCount} records with email/phone-like text.`);
  }

  const report = {
    input_path: options.inputPath,
    record_count: records.length,
    minimum_target: options.minCount,
    passes_minimum_target: records.length >= options.minCount,
    duplicate_skus: duplicateSkus,
    invalid_records: invalidRecords,
    pii_warning_count: piiWarningCount,
    category_breakdown: Object.fromEntries(
      Array.from(categoryCoverage.entries()).sort((left, right) => right[1] - left[1])
    ),
    warnings,
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.strict && (warnings.length > 0 || invalidRecords.length > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Validate Golden Dataset] Failed:', error);
  printUsage();
  process.exit(1);
});
