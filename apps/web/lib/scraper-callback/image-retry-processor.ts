import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getRetryDelay,
  ImageCaptureErrorType,
  shouldRetry,
} from '@/lib/image-capture-errors';
import type {
  ImageErrorType,
  ImageRetryQueueUpdate,
  PendingImageRetry,
} from '@/lib/supabase/database.types';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 3;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_OPEN_MS = 5 * 60_000;

interface ProductRetryContext {
  id: string;
  sku: string;
  sources: Record<string, unknown>;
  scraperSlug: string | null;
}

interface ScraperConfigMatch {
  slug: string;
  base_url: string | null;
}

interface DomainCircuitState {
  openUntil: number | null;
  failures: number[];
}

export interface ImageRetryCaptureRequest {
  productId: string;
  sku: string;
  imageUrl: string;
  domain: string;
  scraperSlug: string | null;
}

export interface ImageRetryCaptureResult {
  success: boolean;
  imageUrl?: string;
  errorType?: ImageCaptureErrorType;
  errorMessage?: string;
}

export interface PollAndProcessResult {
  fetched: number;
  processed: number;
  completed: number;
  failed: number;
  rescheduled: number;
  skippedCircuitOpen: number;
}

export type ImageRetryEntry = PendingImageRetry;

export interface ImageRetryProcessorOptions {
  supabase?: Pick<SupabaseClient, 'rpc' | 'from'>;
  captureImage?: (request: ImageRetryCaptureRequest) => Promise<ImageRetryCaptureResult>;
  now?: () => Date;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  batchSize?: number;
  concurrency?: number;
}

function toImageCaptureErrorType(errorType: ImageErrorType): ImageCaptureErrorType {
  if (Object.values(ImageCaptureErrorType).includes(errorType as ImageCaptureErrorType)) {
    return errorType as ImageCaptureErrorType;
  }

  return ImageCaptureErrorType.UNKNOWN;
}

function buildPendingRetryMarker(imageUrl: string, errorType: ImageErrorType): string {
  const hash = createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  return `pending_retry://${errorType}/${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDomain(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl);
    return parsed.hostname.toLowerCase();
  } catch {
    return 'unknown-domain';
  }
}

function replaceImageReference(
  value: unknown,
  originalUrl: string,
  marker: string,
  replacementUrl: string
): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === originalUrl || trimmed === marker) {
      return replacementUrl;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => replaceImageReference(entry, originalUrl, marker, replacementUrl));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      replaceImageReference(entry, originalUrl, marker, replacementUrl),
    ])
  );
}

function getSupabaseAdmin(): Pick<SupabaseClient, 'rpc' | 'from'> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key);
}

export class ImageRetryProcessor {
  private readonly supabase: Pick<SupabaseClient, 'rpc' | 'from'>;
  private readonly captureImage: (request: ImageRetryCaptureRequest) => Promise<ImageRetryCaptureResult>;
  private readonly now: () => Date;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly domainCircuits = new Map<string, DomainCircuitState>();

  constructor(options: ImageRetryProcessorOptions = {}) {
    this.supabase = options.supabase ?? getSupabaseAdmin();
    this.captureImage = options.captureImage ?? this.defaultCaptureImage;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  }

  async pollAndProcess(): Promise<PollAndProcessResult> {
    const { data, error } = await this.supabase.rpc('get_pending_image_retries', {
      p_limit: this.batchSize,
    });

    if (error) {
      throw new Error(`Failed to fetch pending image retries: ${error.message}`);
    }

    const entries = (data ?? []) as ImageRetryEntry[];
    if (entries.length === 0) {
      return {
        fetched: 0,
        processed: 0,
        completed: 0,
        failed: 0,
        rescheduled: 0,
        skippedCircuitOpen: 0,
      };
    }

    const settled = await this.runWithConcurrency(entries, this.concurrency, async (entry) =>
      this.processRetry(entry)
    );

    return {
      fetched: entries.length,
      processed: settled.length,
      completed: settled.filter((result) => result === 'completed').length,
      failed: settled.filter((result) => result === 'failed').length,
      rescheduled: settled.filter((result) => result === 'rescheduled').length,
      skippedCircuitOpen: settled.filter((result) => result === 'circuit-open').length,
    };
  }

  async processRetry(entry: ImageRetryEntry): Promise<'completed' | 'failed' | 'rescheduled' | 'circuit-open'> {
    const domain = parseDomain(entry.image_url);
    const currentTime = this.now().getTime();

    if (this.isCircuitOpen(domain, currentTime)) {
      const circuitState = this.domainCircuits.get(domain);
      const openUntil = circuitState?.openUntil ?? currentTime + CIRCUIT_BREAKER_OPEN_MS;

      await this.updateRetryEntry(entry.retry_id, {
        status: 'pending',
        scheduled_for: new Date(openUntil).toISOString(),
        last_error: `Circuit breaker open for ${domain}`,
      });

      this.logger.warn(
        `[ImageRetryProcessor] Circuit breaker open for ${domain}; delaying retry ${entry.retry_id}`
      );

      return 'circuit-open';
    }

    await this.updateRetryEntry(entry.retry_id, { status: 'processing', last_error: null });

    try {
      if (!entry.product_id) {
        throw new Error('Retry entry is missing product_id');
      }

      const context = await this.loadProductRetryContext(entry.product_id, entry.image_url);
      const capture = await this.captureImage({
        productId: context.id,
        sku: context.sku,
        imageUrl: entry.image_url,
        scraperSlug: context.scraperSlug,
        domain,
      });

      if (capture.success && capture.imageUrl) {
        await this.persistRetrySuccess(entry, context, capture.imageUrl);
        this.recordDomainSuccess(domain);
        return 'completed';
      }

      const errorType = capture.errorType ?? toImageCaptureErrorType(entry.error_type);
      const errorMessage = capture.errorMessage ?? 'Image capture retry failed';

      return await this.handleRetryFailure(entry, errorType, errorMessage, domain);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = toImageCaptureErrorType(entry.error_type);

      return await this.handleRetryFailure(entry, errorType, errorMessage, domain);
    }
  }

  private readonly defaultCaptureImage = async (): Promise<ImageRetryCaptureResult> => {
    throw new Error('Image retry capture client is not configured');
  };

  private async loadProductRetryContext(productId: string, imageUrl: string): Promise<ProductRetryContext> {
    const { data: product, error } = await this.supabase
      .from('products_ingestion')
      .select('id, sku, sources')
      .eq('id', productId)
      .single();

    if (error || !product) {
      throw new Error(`Unable to load product ${productId}: ${error?.message ?? 'not found'}`);
    }

    const sources = isRecord(product.sources) ? product.sources : {};
    const sourceNames = Object.keys(sources).filter((sourceName) => !sourceName.startsWith('_'));
    const scraperSlug = await this.resolveScraperSlug(sourceNames, imageUrl);

    return {
      id: product.id,
      sku: product.sku,
      sources,
      scraperSlug,
    };
  }

  private async resolveScraperSlug(sourceNames: string[], imageUrl: string): Promise<string | null> {
    if (sourceNames.length === 0) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('scraper_configs')
      .select('slug, base_url')
      .in('slug', sourceNames);

    if (error || !Array.isArray(data) || data.length === 0) {
      return sourceNames[0] ?? null;
    }

    const domain = parseDomain(imageUrl);
    const configs = data as ScraperConfigMatch[];
    const directMatch = configs.find((config) => parseDomain(config.base_url ?? '') === domain);

    return directMatch?.slug ?? configs[0]?.slug ?? sourceNames[0] ?? null;
  }

  private async persistRetrySuccess(
    entry: ImageRetryEntry,
    context: ProductRetryContext,
    capturedImageUrl: string
  ): Promise<void> {
    const marker = buildPendingRetryMarker(entry.image_url, entry.error_type);
    const nextSources = replaceImageReference(context.sources, entry.image_url, marker, capturedImageUrl);

    const { error: productUpdateError } = await this.supabase
      .from('products_ingestion')
      .update({
        sources: nextSources,
        updated_at: this.now().toISOString(),
      })
      .eq('id', context.id);

    if (productUpdateError) {
      throw new Error(`Failed to update product ${context.id} image references: ${productUpdateError.message}`);
    }

    await this.updateRetryEntry(entry.retry_id, {
      status: 'completed',
      last_error: null,
    });
  }

  private async handleRetryFailure(
    entry: ImageRetryEntry,
    errorType: ImageCaptureErrorType,
    errorMessage: string,
    domain: string
  ): Promise<'failed' | 'rescheduled'> {
    const nextRetryCount = entry.retry_count + 1;
    const canRetry = shouldRetry(errorType, nextRetryCount, entry.max_retries);

    this.recordDomainFailure(domain, this.now().getTime());

    if (!canRetry || errorType === ImageCaptureErrorType.NOT_FOUND_404) {
      await this.updateRetryEntry(entry.retry_id, {
        error_type: errorType,
        retry_count: nextRetryCount,
        status: 'failed',
        last_error: errorMessage,
      });

      this.logger.error(
        `[ImageRetryProcessor] Permanently failed retry ${entry.retry_id} (${domain}): ${errorMessage}`
      );

      return 'failed';
    }

    const delayMs = getRetryDelay(errorType, entry.retry_count);
    const scheduledFor = new Date(this.now().getTime() + delayMs).toISOString();

    await this.updateRetryEntry(entry.retry_id, {
      error_type: errorType,
      retry_count: nextRetryCount,
      status: 'pending',
      scheduled_for: scheduledFor,
      last_error: errorMessage,
    });

    this.logger.warn(
      `[ImageRetryProcessor] Rescheduled retry ${entry.retry_id} for ${domain} in ${delayMs}ms (${errorType})`
    );

    return 'rescheduled';
  }

  private recordDomainSuccess(domain: string): void {
    const state = this.domainCircuits.get(domain);
    if (!state) {
      return;
    }

    this.domainCircuits.set(domain, {
      openUntil: null,
      failures: [],
    });
  }

  private recordDomainFailure(domain: string, nowMs: number): void {
    const state = this.domainCircuits.get(domain) ?? { openUntil: null, failures: [] };
    const cutoff = nowMs - CIRCUIT_BREAKER_WINDOW_MS;
    const recentFailures = state.failures.filter((timestamp) => timestamp >= cutoff);
    recentFailures.push(nowMs);

    if (recentFailures.length >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      const openUntil = nowMs + CIRCUIT_BREAKER_OPEN_MS;
      this.domainCircuits.set(domain, {
        openUntil,
        failures: recentFailures,
      });

      this.logger.warn(
        `[ImageRetryProcessor] Opened circuit for ${domain} after ${recentFailures.length} failures in 60s`
      );
      return;
    }

    this.domainCircuits.set(domain, {
      openUntil: state.openUntil,
      failures: recentFailures,
    });
  }

  private isCircuitOpen(domain: string, nowMs: number): boolean {
    const state = this.domainCircuits.get(domain);
    if (!state?.openUntil) {
      return false;
    }

    if (state.openUntil <= nowMs) {
      this.domainCircuits.set(domain, {
        openUntil: null,
        failures: [],
      });
      this.logger.info(`[ImageRetryProcessor] Closed circuit for ${domain}`);
      return false;
    }

    return true;
  }

  private async updateRetryEntry(retryId: string, payload: ImageRetryQueueUpdate): Promise<void> {
    const { error } = await this.supabase
      .from('image_retry_queue')
      .update({
        ...payload,
        updated_at: this.now().toISOString(),
      })
      .eq('id', retryId);

    if (error) {
      throw new Error(`Failed to update retry entry ${retryId}: ${error.message}`);
    }
  }

  private async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    const runWorker = async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
    );

    return results;
  }
}
