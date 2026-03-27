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
  --execute                 Insert queue entries for non-durable images (default)
  --dry-run                 Scan and report without creating queue entries
  --sku <sku>               Limit to a single SKU (repeatable)
  --limit <number>          Max products_ingestion rows to scan when not targeting SKUs
  --batch-size <number>     Products processed per batch (default: 100)
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
    mode: 'execute',
    batchSize: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--execute':
        options.mode = 'execute';
        break;
      case '--dry-run':
        options.mode = 'dry-run';
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
      case '--batch-size':
        options.batchSize = parseIntegerOption('--batch-size', argv[index + 1]);
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
      result,
      null,
      2,
    ),
  );

  if (result.mode === 'dry-run') {
    console.log('\nDry run only. Re-run with --execute to create retry queue entries.');
  }
}

main().catch((error) => {
  console.error('[Login Image Backfill] Failed:', error);
  printUsage();
  process.exit(1);
});
