import { PassThrough, Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { PERSISTED_PIPELINE_STATUSES } from '@/lib/pipeline/types';
import { createAdminClient } from '@/lib/supabase/server';
import {
  normalizePipelineRouteStatus,
  PIPELINE_ROUTE_STATUS_VALUES,
  type PipelineRouteStatus,
} from '@/app/api/admin/pipeline/status-compat';

export const runtime = 'nodejs';

const EXPORT_FILENAME = 'products-export.xlsx';
const PAGE_SIZE = 200;
const ALLOWED_STATUSES = PIPELINE_ROUTE_STATUS_VALUES;

type ExportStatus = PipelineRouteStatus;

type JsonRecord = Record<string, unknown>;
type SelectedImageRecord = {
  url?: unknown;
};
type ExportProduct = {
  sku: string;
  input: unknown;
  consolidated: unknown;
  selected_images: unknown;
  pipeline_status?: string;
};

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

function isExportReady(product: ExportProduct): boolean {
  const input = asRecord(product.input);
  const consolidated = asRecord(product.consolidated);
  const hasName = (asString(consolidated.name) || asString(input.name)).trim().length > 0;
  const hasDescription = (asString(consolidated.description) || asString(input.description)).trim().length > 0;
  const selected = extractSelectedImages(product.selected_images).trim();
  const fallbackImages = extractSelectedImages(consolidated.images).trim();
  return hasName && hasDescription && (selected.length > 0 || fallbackImages.length > 0);
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
        .select('sku, input, consolidated, selected_images, pipeline_status, updated_at')
        .order('updated_at', { ascending: false })
        .order('sku', { ascending: true });
      
      // Only filter by status if not 'all'
      if (status !== 'all') {
        query = query.eq('pipeline_status', status);
      }
      
      const { data, error } = await query.range(from, to);

      if (error) {
        throw new Error(`Failed to export products: ${error.message}`);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const product of data) {
        if (status === 'finalized' && !isExportReady(product)) {
          continue;
        }
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
  const normalizedStatus = normalizePipelineRouteStatus(statusParam, '/api/admin/pipeline/export');

  if (!normalizedStatus) {
    return NextResponse.json(
      {
        error: `Invalid status. Expected one of: ${[...PERSISTED_PIPELINE_STATUSES, 'all'].join(', ')}`,
      },
      { status: 400 }
    );
  }

  const output = new PassThrough();

  void streamWorkbook(normalizedStatus, output).catch((error: unknown) => {
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
