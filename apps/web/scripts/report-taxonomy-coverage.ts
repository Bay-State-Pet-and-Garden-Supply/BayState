import fs from 'fs/promises';
import path from 'path';
import {
  buildTaxonomyNodes,
  parseTaxonomyValues,
  resolveTaxonomySelections,
  type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';
import {
  parseIntegerOption,
  requireServiceRoleClient,
  resolveScriptPath,
} from './gemini-migration-utils';

interface ScriptOptions {
  outputPath: string | null;
  sampleSize: number;
  orphanLimit: number;
}

interface ProductRow {
  id: string;
  sku: string | null;
  name: string | null;
  created_at: string | null;
  product_categories:
    | Array<{
      category?:
        | { id?: string | null; name?: string | null }
        | Array<{ id?: string | null; name?: string | null }>
        | null;
    }>
    | null;
}

interface ProductsIngestionRow {
  sku: string;
  consolidated: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
  updated_at: string | null;
}

function printUsage(): void {
  console.log(`
Usage:
  cd apps/web && bun scripts/report-taxonomy-coverage.ts [options]

Options:
  --output <path>        Optional JSON report path
  --sample-size <n>      Number of product breadcrumb samples to print (default: 20)
  --orphan-limit <n>     Max orphan and unresolved rows to include in output (default: 50)
  --help
`.trim());
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    outputPath: null,
    sampleSize: 20,
    orphanLimit: 50,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--output':
        options.outputPath = resolveScriptPath(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--sample-size':
        options.sampleSize = parseIntegerOption(arg, argv[index + 1], 20);
        index += 1;
        break;
      case '--orphan-limit':
        options.orphanLimit = parseIntegerOption(arg, argv[index + 1], 50);
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

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function extractCategoryIds(row: ProductRow): string[] {
  const categoryIds: string[] = [];

  for (const entry of row.product_categories ?? []) {
    const category = entry.category;

    if (Array.isArray(category)) {
      for (const item of category) {
        if (typeof item?.id === 'string' && item.id.trim().length > 0) {
          categoryIds.push(item.id);
        }
      }
      continue;
    }

    if (typeof category?.id === 'string' && category.id.trim().length > 0) {
      categoryIds.push(category.id);
    }
  }

  return Array.from(new Set(categoryIds));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const supabase = requireServiceRoleClient();

  const [{ data: taxonomyRows, error: taxonomyError }, { data: products, error: productsError }, { data: ingestionRows, error: ingestionError }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, parent_id, description, display_order, image_url, is_featured'),
    supabase
      .from('products')
      .select('id, sku, name, created_at, product_categories(category:categories(id, name))'),
    supabase
      .from('products_ingestion')
      .select('sku, consolidated, input, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  if (taxonomyError) {
    throw new Error(taxonomyError.message);
  }
  if (productsError) {
    throw new Error(productsError.message);
  }
  if (ingestionError) {
    throw new Error(ingestionError.message);
  }

  const taxonomyNodes = buildTaxonomyNodes((taxonomyRows || []) as TaxonomyCategoryRecord[]);
  const breadcrumbByCategoryId = new Map(
    taxonomyNodes.map((category) => [category.id, category.breadcrumb])
  );

  const productRows = (products || []) as ProductRow[];
  const sampleRows = shuffle(
    productRows.filter((row) => extractCategoryIds(row).length > 0)
  ).slice(0, options.sampleSize);

  const breadcrumbSamples = sampleRows.map((row) => {
    const categoryBreadcrumbs = extractCategoryIds(row)
      .map((categoryId) => breadcrumbByCategoryId.get(categoryId))
      .filter((breadcrumb): breadcrumb is string => Boolean(breadcrumb))
      .sort();

    return {
      product_id: row.id,
      sku: row.sku,
      name: row.name,
      breadcrumbs: categoryBreadcrumbs,
    };
  });

  const orphanProducts = productRows
    .filter((row) => extractCategoryIds(row).length === 0)
    .slice(0, options.orphanLimit)
    .map((row) => ({
      product_id: row.id,
      sku: row.sku,
      name: row.name,
      created_at: row.created_at,
      reason: 'No product_categories link exists.',
    }));

  const unresolvedIngestionCategories = ((ingestionRows || []) as ProductsIngestionRow[])
    .map((row) => {
      const rawCategoryValue = row.consolidated?.category ?? row.input?.category;
      const categoryValues = parseTaxonomyValues(
        Array.isArray(rawCategoryValue)
          ? rawCategoryValue.filter((entry): entry is string => typeof entry === 'string')
          : typeof rawCategoryValue === 'string'
            ? rawCategoryValue
            : null
      );

      if (categoryValues.length === 0) {
        return null;
      }

      const resolution = resolveTaxonomySelections(
        categoryValues,
        (taxonomyRows || []) as TaxonomyCategoryRecord[]
      );

      if (resolution.unresolved.length === 0) {
        return null;
      }

      return {
        sku: row.sku,
        updated_at: row.updated_at,
        category_values: categoryValues,
        unresolved_values: resolution.unresolved,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, options.orphanLimit);

  const report = {
    generated_at: new Date().toISOString(),
    sample_size: options.sampleSize,
    breadcrumb_samples: breadcrumbSamples,
    orphan_product_count: productRows.filter((row) => extractCategoryIds(row).length === 0).length,
    orphan_products: orphanProducts,
    unresolved_ingestion_count: ((ingestionRows || []) as ProductsIngestionRow[]).reduce((count, row) => {
      const rawCategoryValue = row.consolidated?.category ?? row.input?.category;
      const categoryValues = parseTaxonomyValues(
        Array.isArray(rawCategoryValue)
          ? rawCategoryValue.filter((entry): entry is string => typeof entry === 'string')
          : typeof rawCategoryValue === 'string'
            ? rawCategoryValue
            : null
      );

      if (categoryValues.length === 0) {
        return count;
      }

      const resolution = resolveTaxonomySelections(
        categoryValues,
        (taxonomyRows || []) as TaxonomyCategoryRecord[]
      );

      return count + (resolution.unresolved.length > 0 ? 1 : 0);
    }, 0),
    unresolved_ingestion_categories: unresolvedIngestionCategories,
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
