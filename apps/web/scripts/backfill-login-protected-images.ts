import path from 'path';
import {
  runLoginProtectedImageBackfill,
  type LoginProtectedImageBackfillOptions,
} from './backfill-login-protected-images-logic';

function printUsage(): void {
  console.log(`
Usage:
  cd apps/web && bun scripts/backfill-login-protected-images.ts [options]

Options:
  --execute                 Apply the cleanup and queue replacement scrape jobs
  --sku <sku>               Limit to a single SKU (repeatable)
  --limit <number>          Max products_ingestion rows to scan when not targeting SKUs
  --max-workers <number>    Workers per queued scrape job
  --chunk-size <number>     SKUs per scrape_job_chunks row
  --help                    Show this help text
`.trim());
}

function parseIntegerOption(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): LoginProtectedImageBackfillOptions {
  const options: LoginProtectedImageBackfillOptions = {
    mode: 'dry-run',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--execute':
        options.mode = 'execute';
        break;
      case '--sku': {
        const sku = argv[index + 1]?.trim();
        if (!sku) {
          throw new Error('Missing value for --sku');
        }
        options.skus = [...(options.skus ?? []), sku];
        index += 1;
        break;
      }
      case '--limit':
        options.limit = parseIntegerOption('--limit', argv[index + 1]);
        index += 1;
        break;
      case '--max-workers':
        options.maxWorkers = parseIntegerOption('--max-workers', argv[index + 1]);
        index += 1;
        break;
      case '--chunk-size':
        options.chunkSize = parseIntegerOption('--chunk-size', argv[index + 1]);
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
  process.chdir(path.resolve(__dirname, '..'));

  const options = parseArgs(process.argv.slice(2));
  const result = await runLoginProtectedImageBackfill(options);

  console.log(
    JSON.stringify(
      {
        ...result,
        candidateSkus: result.candidates.map((candidate) => candidate.sku),
      },
      null,
      2,
    ),
  );

  if (result.mode === 'dry-run') {
    console.log('\nDry run only. Re-run with --execute to apply the cleanup and queue replacement scrapes.');
  }
}

main().catch((error) => {
  console.error('[Login Image Backfill] Failed:', error);
  printUsage();
  process.exit(1);
});
