import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parse as parseYaml } from 'yaml';
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
const MAX_RELOGIN_ATTEMPTS = 2;
const AUTH_METADATA_PREFIX = '[image-retry-auth]';
const execFileAsync = promisify(execFile);

function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const turboConfigPath = path.join(currentDir, 'turbo.json');
    const scraperPath = path.join(currentDir, 'apps', 'scraper', 'scrapers', 'configs');

    if (existsSync(turboConfigPath) && existsSync(scraperPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function resolveScraperRoot(): string {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'apps', 'scraper');
  }

  const siblingCandidate = path.resolve(process.cwd(), '..', 'scraper');
  if (existsSync(path.join(siblingCandidate, 'scrapers', 'configs'))) {
    return siblingCandidate;
  }

  const workspaceCandidate = path.resolve(process.cwd(), 'apps', 'scraper');
  if (existsSync(path.join(workspaceCandidate, 'scrapers', 'configs'))) {
    return workspaceCandidate;
  }

  return siblingCandidate;
}

const SCRAPER_ROOT = resolveScraperRoot();

interface ProductRetryContext {
  id: string;
  sku: string;
  sources: Record<string, unknown>;
  scraper: ScraperRuntimeConfig | null;
}

interface ScraperConfigMatch {
  slug: string;
  file_path: string;
}

interface ScraperYamlConfig {
  base_url?: string;
  requires_login?: boolean;
}

export interface ScraperRuntimeConfig {
  slug: string;
  filePath: string;
  baseUrl: string | null;
  requiresLogin: boolean;
}

interface DomainCircuitState {
  openUntil: number | null;
  failures: number[];
}

interface BrowserSessionState {
  sessionExpiresAt: string | null;
  storageStatePath: string;
}

export interface ResolvedImageRetryTarget {
  productId: string;
  sku: string;
  sources: Record<string, unknown>;
  matchedSourceNames: string[];
  scraper: ScraperRuntimeConfig | null;
  requiresLogin: boolean;
}

interface RetryAuthMetadata {
  reloginAttempts: number;
  sessionExpiresAt: string | null;
}

interface RetryErrorEnvelope {
  message: string;
  auth?: RetryAuthMetadata;
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
  readBrowserSession?: (scraper: ScraperRuntimeConfig) => Promise<BrowserSessionState>;
  reauthenticate?: (context: ProductRetryContext, session: BrowserSessionState) => Promise<BrowserSessionState>;
  now?: () => Date;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  batchSize?: number;
  concurrency?: number;
}

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'default';
}

function buildBrowserStatePath(scraper: ScraperRuntimeConfig): string {
  const siteKey = slugify(scraper.slug);
  if (!scraper.baseUrl) {
    return path.join(SCRAPER_ROOT, '.browser_storage_states', `${siteKey}.json`);
  }

  let domainSource = scraper.baseUrl;
  try {
    const parsed = new URL(scraper.baseUrl);
    domainSource = parsed.host || parsed.pathname || scraper.baseUrl;
  } catch {}

  const domainKey = slugify(domainSource);
  const browserStateKey = domainKey === siteKey ? siteKey : `${siteKey}--${domainKey}`;
  return path.join(SCRAPER_ROOT, '.browser_storage_states', `${browserStateKey}.json`);
}

function parseRetryErrorEnvelope(lastError: string | null | undefined): RetryErrorEnvelope {
  if (!lastError) {
    return { message: '' };
  }

  if (!lastError.startsWith(AUTH_METADATA_PREFIX)) {
    return { message: lastError };
  }

  const payload = lastError.slice(AUTH_METADATA_PREFIX.length);
  try {
    const parsed = JSON.parse(payload) as Partial<RetryErrorEnvelope>;
    return {
      message: typeof parsed.message === 'string' ? parsed.message : '',
      auth: parsed.auth
        ? {
            reloginAttempts:
              typeof parsed.auth.reloginAttempts === 'number' ? parsed.auth.reloginAttempts : 0,
            sessionExpiresAt:
              typeof parsed.auth.sessionExpiresAt === 'string' ? parsed.auth.sessionExpiresAt : null,
          }
        : undefined,
    };
  } catch {
    return { message: lastError };
  }
}

function formatRetryError(message: string, auth?: RetryAuthMetadata): string {
  if (!auth) {
    return message;
  }

  return `${AUTH_METADATA_PREFIX}${JSON.stringify({ message, auth })}`;
}

function isExpired(sessionExpiresAt: string | null, now: Date): boolean {
  if (!sessionExpiresAt) {
    return true;
  }

  const expiresAtMs = new Date(sessionExpiresAt).getTime();
  return Number.isNaN(expiresAtMs) || expiresAtMs <= now.getTime();
}

function getSessionExpiryFromStorageState(storageState: string): string | null {
  const parsed = JSON.parse(storageState) as { cookies?: Array<{ expires?: number }> };
  if (!Array.isArray(parsed.cookies)) {
    return null;
  }

  const expiries = parsed.cookies
    .map((cookie) => (typeof cookie.expires === 'number' ? cookie.expires : Number.NaN))
    .filter((expires) => Number.isFinite(expires) && expires > 0)
    .sort((left, right) => left - right);

  if (expiries.length === 0) {
    return null;
  }

  return new Date(expiries[0] * 1000).toISOString();
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

function valueContainsImageUrl(value: unknown, imageUrl: string): boolean {
  if (typeof value === 'string') {
    return value.trim() === imageUrl;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => valueContainsImageUrl(entry, imageUrl));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some((entry) => valueContainsImageUrl(entry, imageUrl));
}

async function loadScraperRuntimeConfig(
  supabase: Pick<SupabaseClient, 'from'>,
  sourceNames: string[],
  imageUrl: string
): Promise<ScraperRuntimeConfig | null> {
  if (sourceNames.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from('scraper_configs')
    .select('slug, file_path')
    .in('slug', sourceNames);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const configs = data as ScraperConfigMatch[];
  const yamlConfigs = await Promise.all(
    configs.map(async (config) => {
      const filePath = path.resolve(SCRAPER_ROOT, config.file_path);
      const rawConfig = await readFile(filePath, 'utf8');
      const parsed = parseYaml(rawConfig) as ScraperYamlConfig;
      return {
        slug: config.slug,
        filePath: config.file_path,
        baseUrl: typeof parsed.base_url === 'string' ? parsed.base_url : null,
        requiresLogin: Boolean(parsed.requires_login),
      } satisfies ScraperRuntimeConfig;
    })
  );

  const domain = parseDomain(imageUrl);
  const directMatch = yamlConfigs.find((config) => parseDomain(config.baseUrl ?? '') === domain);

  return directMatch ?? yamlConfigs[0] ?? null;
}

export async function resolveImageRetryTarget(
  supabase: Pick<SupabaseClient, 'from'>,
  productId: string,
  imageUrl: string
): Promise<ResolvedImageRetryTarget | null> {
  const { data: product, error } = await supabase
    .from('products_ingestion')
    .select('sku, sources')
    .eq('sku', productId)
    .single();

  if (error || !product) {
    return null;
  }

  const sources = isRecord(product.sources) ? product.sources : {};
  const sourceNames = Object.keys(sources).filter((sourceName) => !sourceName.startsWith('_'));
  const matchedSourceNames = sourceNames.filter((sourceName) =>
    valueContainsImageUrl(sources[sourceName], imageUrl)
  );
  const scraper = await loadScraperRuntimeConfig(
    supabase,
    matchedSourceNames.length > 0 ? matchedSourceNames : sourceNames,
    imageUrl
  );

  return {
    productId: product.sku,
    sku: product.sku,
    sources,
    matchedSourceNames,
    scraper,
    requiresLogin: Boolean(scraper?.requiresLogin),
  };
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
  private readonly readBrowserSession: (scraper: ScraperRuntimeConfig) => Promise<BrowserSessionState>;
  private readonly reauthenticate: (
    context: ProductRetryContext,
    session: BrowserSessionState
  ) => Promise<BrowserSessionState>;
  private readonly now: () => Date;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly domainCircuits = new Map<string, DomainCircuitState>();

  constructor(options: ImageRetryProcessorOptions = {}) {
    this.supabase = options.supabase ?? getSupabaseAdmin();
    this.captureImage = options.captureImage ?? this.defaultCaptureImage;
    this.readBrowserSession = options.readBrowserSession ?? this.defaultReadBrowserSession;
    this.reauthenticate = options.reauthenticate ?? this.defaultReauthenticate;
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
      if (!entry.sku) {
        throw new Error('Retry entry is missing sku');
      }

      const context = await this.loadProductRetryContext(entry.sku, entry.image_url);
      const authEnvelope = parseRetryErrorEnvelope(entry.last_error);
      const authMetadata = await this.refreshAuthSessionIfNeeded(entry, context, authEnvelope.auth);
      const capture = await this.captureWithReauthentication(entry, context, domain, authMetadata);

      if (capture.success && capture.imageUrl) {
        await this.persistRetrySuccess(entry, context, capture.imageUrl);
        this.recordDomainSuccess(domain);
        return 'completed';
      }

      const errorType = capture.errorType ?? toImageCaptureErrorType(entry.error_type);
      const errorMessage = capture.errorMessage ?? 'Image capture retry failed';

      return await this.handleRetryFailure(entry, errorType, errorMessage, domain, capture.authMetadata);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = toImageCaptureErrorType(entry.error_type);

      return await this.handleRetryFailure(
        entry,
        errorType,
        errorMessage,
        domain,
        parseRetryErrorEnvelope(entry.last_error).auth
      );
    }
  }

  private readonly defaultCaptureImage = async (): Promise<ImageRetryCaptureResult> => {
    throw new Error('Image retry capture client is not configured');
  };

  private readonly defaultReadBrowserSession = async (
    scraper: ScraperRuntimeConfig
  ): Promise<BrowserSessionState> => {
    const storageStatePath = buildBrowserStatePath(scraper);

    try {
      const storageState = await readFile(storageStatePath, 'utf8');
      return {
        sessionExpiresAt: getSessionExpiryFromStorageState(storageState),
        storageStatePath,
      };
    } catch {
      return {
        sessionExpiresAt: null,
        storageStatePath,
      };
    }
  };

  private readonly defaultReauthenticate = async (
    context: ProductRetryContext,
    _session: BrowserSessionState
  ): Promise<BrowserSessionState> => {
    if (!context.scraper?.filePath) {
      throw new Error('Cannot re-authenticate without a scraper config file');
    }

    const configPath = path.resolve(SCRAPER_ROOT, context.scraper.filePath);
    await execFileAsync('python', ['runner.py', '--local', '--config', configPath, '--sku', context.sku], {
      cwd: SCRAPER_ROOT,
      env: {
        ...process.env,
        USE_YAML_CONFIGS: 'true',
      },
    });

    return this.readBrowserSession(context.scraper);
  };

  private async loadProductRetryContext(productId: string, imageUrl: string): Promise<ProductRetryContext> {
    const target = await resolveImageRetryTarget(this.supabase, productId, imageUrl);

    if (!target) {
      throw new Error(`Unable to load product ${productId}: not found`);
    }

    return {
      id: target.productId,
      sku: target.sku,
      sources: target.sources,
      scraper: target.scraper,
    };
  }

  private async refreshAuthSessionIfNeeded(
    entry: ImageRetryEntry,
    context: ProductRetryContext,
    authMetadata?: RetryAuthMetadata
  ): Promise<RetryAuthMetadata | undefined> {
    if (toImageCaptureErrorType(entry.error_type) !== ImageCaptureErrorType.AUTH_401 || !context.scraper?.requiresLogin) {
      return authMetadata;
    }

    const session = await this.readBrowserSession(context.scraper);
    const nextMetadata: RetryAuthMetadata = {
      reloginAttempts: authMetadata?.reloginAttempts ?? 0,
      sessionExpiresAt: session.sessionExpiresAt,
    };

    if (!isExpired(session.sessionExpiresAt, this.now())) {
      return nextMetadata;
    }

    if (nextMetadata.reloginAttempts >= MAX_RELOGIN_ATTEMPTS) {
      return nextMetadata;
    }

    const refreshedSession = await this.reauthenticate(context, session);
    return {
      reloginAttempts: nextMetadata.reloginAttempts + 1,
      sessionExpiresAt: refreshedSession.sessionExpiresAt,
    };
  }

  private async captureWithReauthentication(
    entry: ImageRetryEntry,
    context: ProductRetryContext,
    domain: string,
    authMetadata?: RetryAuthMetadata
  ): Promise<ImageRetryCaptureResult & { authMetadata?: RetryAuthMetadata }> {
    let currentAuthMetadata = authMetadata;
    let capture = await this.captureImage({
      productId: context.id,
      sku: context.sku,
      imageUrl: entry.image_url,
      scraperSlug: context.scraper?.slug ?? null,
      domain,
    });

    while (
      capture.errorType === ImageCaptureErrorType.AUTH_401 &&
      context.scraper?.requiresLogin &&
      (currentAuthMetadata?.reloginAttempts ?? 0) < MAX_RELOGIN_ATTEMPTS
    ) {
      const refreshedSession = await this.reauthenticate(context, {
        sessionExpiresAt: currentAuthMetadata?.sessionExpiresAt ?? null,
        storageStatePath: buildBrowserStatePath(context.scraper),
      });

      currentAuthMetadata = {
        reloginAttempts: (currentAuthMetadata?.reloginAttempts ?? 0) + 1,
        sessionExpiresAt: refreshedSession.sessionExpiresAt,
      };

      capture = await this.captureImage({
        productId: context.id,
        sku: context.sku,
        imageUrl: entry.image_url,
        scraperSlug: context.scraper.slug,
        domain,
      });

      if (capture.success) {
        return { ...capture, authMetadata: currentAuthMetadata };
      }
    }

    return {
      ...capture,
      authMetadata: currentAuthMetadata,
    };
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
      .eq('sku', context.id);

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
    domain: string,
    authMetadata?: RetryAuthMetadata
  ): Promise<'failed' | 'rescheduled'> {
    const nextRetryCount = entry.retry_count + 1;
    const canRetry = shouldRetry(errorType, nextRetryCount, entry.max_retries);
    const exhaustedReloginAttempts =
      errorType === ImageCaptureErrorType.AUTH_401 &&
      (authMetadata?.reloginAttempts ?? 0) >= MAX_RELOGIN_ATTEMPTS;

    this.recordDomainFailure(domain, this.now().getTime());

    if (!canRetry || errorType === ImageCaptureErrorType.NOT_FOUND_404 || exhaustedReloginAttempts) {
      await this.updateRetryEntry(entry.retry_id, {
        error_type: errorType,
        retry_count: nextRetryCount,
        status: 'failed',
        last_error: formatRetryError(errorMessage, authMetadata),
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
      last_error: formatRetryError(errorMessage, authMetadata),
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
