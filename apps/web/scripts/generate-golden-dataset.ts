import { buildConsolidationSourcesPayload } from '@/lib/product-sources';
import {
  parseIntegerOption,
  requireServiceRoleClient,
  resolveScriptPath,
  writeJsonLines,
  type GoldenDatasetRecord,
} from './gemini-migration-utils';
import {
  buildTaxonomyNodes,
  type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

type ProductsIngestionRow = {
  sku: string;
  input: Record<string, unknown> | null;
  sources: Record<string, unknown> | null;
  consolidated: Record<string, unknown> | null;
  confidence_score: number | null;
  pipeline_status: string | null;
  updated_at: string | null;
};

type StorefrontProductRow = {
  sku: string | null;
  name: string | null;
  description: string | null;
  long_description: string | null;
  search_keywords: string | null;
  weight: number | null;
  shopsite_pages: unknown;
  brand:
    | { name?: string | null }
    | Array<{ name?: string | null }>
    | null;
  product_categories:
    | Array<{
      category?:
        | { id?: string | null; name?: string | null }
        | Array<{ id?: string | null; name?: string | null }>
        | null;
    }>
    | null;
};

function printUsage(): void {
  console.log(`
Usage:
  cd apps/web && bun scripts/generate-golden-dataset.ts [options]

Options:
  --output <path>    Output JSONL path (default: tests/fixtures/golden-dataset.jsonl)
  --limit <number>   Max records to export
  --help
`.trim());
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function toOptionalDelimitedString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  const values = toOptionalStringArray(value);
  return values && values.length > 0 ? values.join('|') : undefined;
}

function pickExpectedOutput(
  value: Record<string, unknown> | null,
  fallbackConfidenceScore?: number | null
): GoldenDatasetRecord['expected_output'] | null {
  if (!value) {
    return null;
  }

  const expectedOutput: GoldenDatasetRecord['expected_output'] = {
    name: toOptionalString(value.name),
    brand: toOptionalString(value.brand),
    weight: toOptionalString(value.weight),
    description: toOptionalString(value.description),
    long_description: toOptionalString(value.long_description),
    search_keywords: toOptionalString(value.search_keywords),
    category: toOptionalDelimitedString(value.category),
    product_on_pages: toOptionalDelimitedString(value.product_on_pages),
    confidence_score: toOptionalNumber(value.confidence_score) ?? toOptionalNumber(fallbackConfidenceScore),
  };

  const populatedFieldCount = Object.values(expectedOutput).filter((field) => {
    if (field === null || field === undefined) {
      return false;
    }

    if (typeof field === 'string') {
      return field.trim().length > 0;
    }

    if (Array.isArray(field)) {
      return field.length > 0;
    }

    return true;
  }).length;

  return populatedFieldCount > 0 ? expectedOutput : null;
}

function extractBrandName(value: StorefrontProductRow['brand']): string | undefined {
  if (Array.isArray(value)) {
    return toOptionalString(value[0]?.name);
  }

  return toOptionalString(value?.name);
}

function extractCategoryBreadcrumbs(
  value: StorefrontProductRow['product_categories'],
  breadcrumbById: Map<string, string>
): string[] {
  const categoryBreadcrumbs: string[] = [];

  for (const entry of value ?? []) {
    const category = entry.category;
    if (Array.isArray(category)) {
      for (const item of category) {
        const breadcrumb = item?.id ? breadcrumbById.get(item.id) : undefined;
        const fallbackName = toOptionalString(item?.name);
        if (breadcrumb) {
          categoryBreadcrumbs.push(breadcrumb);
        } else if (fallbackName) {
          categoryBreadcrumbs.push(fallbackName);
        }
      }
      continue;
    }

    const breadcrumb = category?.id ? breadcrumbById.get(category.id) : undefined;
    const fallbackName = toOptionalString(category?.name);
    if (breadcrumb) {
      categoryBreadcrumbs.push(breadcrumb);
    } else if (fallbackName) {
      categoryBreadcrumbs.push(fallbackName);
    }
  }

  return Array.from(new Set(categoryBreadcrumbs));
}

function buildStorefrontFallbackOutput(
  row: StorefrontProductRow | undefined,
  breadcrumbById: Map<string, string>,
  confidenceScore: number | null
): GoldenDatasetRecord['expected_output'] | null {
  if (!row) {
    return null;
  }

  const categoryNames = extractCategoryBreadcrumbs(row.product_categories, breadcrumbById);
  const shopsitePages = toOptionalDelimitedString(row.shopsite_pages);

  return pickExpectedOutput({
    name: row.name,
    brand: extractBrandName(row.brand),
    weight: typeof row.weight === 'number' ? String(row.weight) : null,
    description: row.description,
    long_description: row.long_description,
    search_keywords: row.search_keywords,
    category: categoryNames,
    product_on_pages: shopsitePages,
    confidence_score: confidenceScore ?? 1,
  }, confidenceScore ?? 1);
}

function parseArgs(argv: string[]): { outputPath: string; limit?: number } {
  const options: { outputPath: string; limit?: number } = {
    outputPath: resolveScriptPath('tests/fixtures/golden-dataset.jsonl'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--output':
        options.outputPath = resolveScriptPath(argv[index + 1] ?? '');
        index += 1;
        break;
      case '--limit':
        options.limit = parseIntegerOption(arg, argv[index + 1]);
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
  const supabase = requireServiceRoleClient();

  let query = supabase
    .from('products_ingestion')
    .select('sku, input, sources, consolidated, confidence_score, pipeline_status, updated_at')
    .not('sources', 'is', null)
    .not('consolidated', 'is', null)
    .order('updated_at', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ProductsIngestionRow[];
  const storefrontSkus = rows.map((row) => row.sku);
  const { data: taxonomyRows, error: taxonomyError } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, description, display_order, image_url, is_featured');

  if (taxonomyError) {
    throw new Error(taxonomyError.message);
  }

  const breadcrumbById = new Map(
    buildTaxonomyNodes((taxonomyRows || []) as TaxonomyCategoryRecord[]).map((category) => [
      category.id,
      category.breadcrumb,
    ])
  );
  const { data: storefrontProducts, error: storefrontError } = await supabase
    .from('products')
    .select(`
      sku,
      name,
      description,
      long_description,
      search_keywords,
      weight,
      shopsite_pages,
      brand:brands(name),
      product_categories(category:categories(id, name))
    `)
    .in('sku', storefrontSkus);

  if (storefrontError) {
    throw new Error(storefrontError.message);
  }

  const storefrontBySku = new Map(
    ((storefrontProducts ?? []) as StorefrontProductRow[])
      .filter((row) => typeof row.sku === 'string' && row.sku.trim().length > 0)
      .map((row) => [row.sku as string, row])
  );

  const records: GoldenDatasetRecord[] = [];
  let storefrontFallbackCount = 0;
  let emptyExpectedCount = 0;

  for (const row of rows) {
    if (!row.sources) {
      continue;
    }

    const consolidatedExpectedOutput = pickExpectedOutput(row.consolidated, row.confidence_score);
    const expectedOutput = consolidatedExpectedOutput
      ?? buildStorefrontFallbackOutput(
        storefrontBySku.get(row.sku),
        breadcrumbById,
        row.confidence_score
      );
    if (!expectedOutput) {
      emptyExpectedCount += 1;
      continue;
    }

    if (!consolidatedExpectedOutput) {
      storefrontFallbackCount += 1;
    }

    const product = {
      sku: row.sku,
      sources: buildConsolidationSourcesPayload(row.sources, row.input),
    };

    const sourceCount = Object.keys(product.sources).length;
    if (sourceCount === 0) {
      continue;
    }

    records.push({
      sku: row.sku,
      product_name:
        typeof expectedOutput.name === 'string'
          ? expectedOutput.name
          : typeof row.input?.name === 'string'
            ? row.input.name
            : null,
      brand:
        typeof expectedOutput.brand === 'string'
          ? expectedOutput.brand
          : typeof row.input?.brand === 'string'
            ? row.input.brand
            : null,
      category: typeof expectedOutput.category === 'string' ? expectedOutput.category : null,
      source_count: sourceCount,
      generated_at: new Date().toISOString(),
      expected_output: expectedOutput,
      product,
      metadata: {
        source: 'products_ingestion',
        pipeline_status: row.pipeline_status,
        updated_at: row.updated_at,
        expected_source: consolidatedExpectedOutput ? 'consolidated' : 'storefront_fallback',
      },
    });
  }

  await writeJsonLines(options.outputPath, records);

  console.log(JSON.stringify({
    output_path: options.outputPath,
    source_rows: rows.length,
    record_count: records.length,
    storefront_fallback_count: storefrontFallbackCount,
    unresolved_expected_rows: emptyExpectedCount,
    target_count: 1000,
    target_gap: Math.max(0, 1000 - records.length),
    note: records.length < 1000
      ? 'Current live products_ingestion data does not yet meet the 1000-record target.'
      : 'Golden dataset meets the 1000-record target.',
  }, null, 2));
}

main().catch((error) => {
  console.error('[Generate Golden Dataset] Failed:', error);
  printUsage();
  process.exit(1);
});
