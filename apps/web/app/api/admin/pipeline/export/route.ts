import { PassThrough, Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const EXPORT_FILENAME = 'products-export.xlsx';
const PAGE_SIZE = 200;
const ALLOWED_STATUSES = ['registered', 'enriched', 'finalized', 'all'] as const;

type ExportStatus = (typeof ALLOWED_STATUSES)[number];

type JsonRecord = Record<string, unknown>;
type SelectedImageRecord = {
  url?: unknown;
};
type ExportProduct = {
  sku: string;
  input: unknown;
  consolidated: unknown;
  selected_images: unknown;
};

function isExportStatus(value: string): value is ExportStatus {
  return ALLOWED_STATUSES.includes(value as ExportStatus);
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function asNumber(value: unknown): number | string {
  return typeof value === 'number' ? value : '';
}

function extractSelectedImages(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  const urls = value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (entry && typeof entry === 'object') {
        return asString((entry as SelectedImageRecord).url);
      }

      return '';
    })
    .filter((url) => url.length > 0);

  return urls.join(', ');
}

export async function streamWorkbookRows(
  products: AsyncIterable<ExportProduct>,
  output: PassThrough
) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useStyles: false,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Products');

  worksheet.columns = [
    { header: 'SKU', key: 'sku', width: 24 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Price', key: 'price', width: 14 },
    { header: 'Brand', key: 'brand', width: 24 },
    { header: 'Weight', key: 'weight', width: 16 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Product_Type', key: 'productType', width: 24 },
    { header: 'Stock_Status', key: 'stockStatus', width: 20 },
    { header: 'Selected Images', key: 'selectedImages', width: 80 },
  ];

  for await (const product of products) {
    const input = asRecord(product.input);
    const consolidated = asRecord(product.consolidated);

    worksheet.addRow({
      sku: product.sku,
      name: asString(consolidated.name) || asString(input.name),
      description: asString(consolidated.description) || asString(input.description),
      price: asNumber(consolidated.price),
      brand: asString(consolidated.brand) || asString(consolidated.brand_name) || asString(consolidated.brand_id) || asString(input.brand),
      weight: asString(consolidated.weight),
      category: asString(consolidated.category),
      productType: asString(consolidated.product_type),
      stockStatus: asString(consolidated.stock_status),
      selectedImages: extractSelectedImages(product.selected_images) || extractSelectedImages(consolidated.images),
    }).commit();
  }

  await worksheet.commit();
  await workbook.commit();
}

export async function streamWorkbook(status: ExportStatus | 'all', output: PassThrough) {
  const supabase = await createAdminClient();

  async function* loadProducts(): AsyncGenerator<ExportProduct> {
    let page = 0;

    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      let query = supabase
        .from('products_ingestion')
        .select('sku, input, consolidated, selected_images, pipeline_status_new, updated_at')
        .order('updated_at', { ascending: false })
        .order('sku', { ascending: true });
      
      // Only filter by status if not 'all'
      if (status !== 'all') {
        query = query.eq('pipeline_status_new', status);
      }
      
      const { data, error } = await query.range(from, to);

      if (error) {
        throw new Error(`Failed to export products: ${error.message}`);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const product of data) {
        yield product;
      }

      if (data.length < PAGE_SIZE) {
        break;
      }

      page += 1;
    }
  }

  await streamWorkbookRows(loadProducts(), output);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const statusParam = request.nextUrl.searchParams.get('status') ?? 'finalized';

  if (!isExportStatus(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status. Expected one of: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const output = new PassThrough();

  void streamWorkbook(statusParam, output).catch((error: unknown) => {
    console.error('Pipeline export stream failed:', error);
    output.destroy(error instanceof Error ? error : new Error('Pipeline export failed'));
  });

  return new NextResponse(Readable.toWeb(output) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${EXPORT_FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  });
}
