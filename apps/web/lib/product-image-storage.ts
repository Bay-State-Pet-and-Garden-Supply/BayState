import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_RETRIES,
  classifyHttpError,
  getRetryDelay,
  ImageCaptureErrorType,
} from './image-capture-errors';
import type { ImageErrorType, ImageRetryQueueInsert } from './supabase/database.types';

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const PENDING_RETRY_IMAGE_PREFIX = 'pending_retry://';

const INLINE_IMAGE_DATA_URL_REGEX = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;
const HTTP_STATUS_CODE_REGEX = /\b(?:http\s*)?(\d{3})\b/i;

const IMAGE_ERROR_TYPES = new Set<ImageErrorType>([
  ImageCaptureErrorType.AUTH_401,
  ImageCaptureErrorType.NOT_FOUND_404,
  ImageCaptureErrorType.NETWORK_TIMEOUT,
  ImageCaptureErrorType.CORS_BLOCKED,
  ImageCaptureErrorType.UNKNOWN,
]);

interface ParsedInlineImageDataUrl {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  dataUrl: string;
}

interface ReplaceInlineImageDataUrlOptions {
  folderPath: string;
  productId?: string | null;
  scraperImageMetadata?: Iterable<ScraperImageCaptureResult>;
  onError?: (message: string, error: unknown) => void;
}

export interface ScraperImageCaptureResult {
  status?: 'success' | 'error';
  data_url?: string | null;
  error_type?: ImageErrorType | null;
  error_message?: string | null;
  original_url?: string | null;
  status_code?: number | null;
}

export interface QueuedInlineImage {
  errorType: ImageErrorType;
  imageUrl: string;
  marker: string;
  path: string;
  scheduledFor: string;
}

export interface ReplaceInlineImageDataUrlsResult<T> {
  value: T;
  queuedImages: QueuedInlineImage[];
}

interface QueuedInlineImageCacheEntry {
  errorType: ImageErrorType;
  imageUrl: string;
  marker: string;
  scheduledFor: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isImageErrorType(value: unknown): value is ImageErrorType {
  return typeof value === 'string' && IMAGE_ERROR_TYPES.has(value as ImageErrorType);
}

function isScraperImageCaptureResult(value: unknown): value is ScraperImageCaptureResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    'data_url' in value ||
    'error_type' in value ||
    'error_message' in value ||
    'original_url' in value ||
    'status' in value
  );
}

function normalizeContentTypeExtension(contentType: string): string {
  const normalized = contentType.toLowerCase();

  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/x-icon') return 'ico';

  const [, subtype = 'png'] = normalized.split('/');
  return subtype.replace(/\+.*/, '') || 'png';
}

function sanitizeStoragePathSegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStorageFolderPath(folderPath: string): string {
  const normalized = folderPath
    .split('/')
    .map(sanitizeStoragePathSegment)
    .filter((segment) => segment.length > 0);

  return normalized.join('/') || 'uploads';
}

export function buildProductImageStorageFolder(...segments: string[]): string {
  return normalizeStorageFolderPath(segments.join('/'));
}

export function isInlineImageDataUrl(value: string): boolean {
  return INLINE_IMAGE_DATA_URL_REGEX.test(value.trim());
}

export function isProductImageStorageUrl(value: string): boolean {
  const normalized = value.trim();

  return (
    normalized.includes(`/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`) ||
    normalized.includes(`/storage/v1/render/image/public/${PRODUCT_IMAGES_BUCKET}/`)
  );
}

export function isDurableProductImageReference(value: string): boolean {
  const normalized = value.trim();

  return isInlineImageDataUrl(normalized) || isProductImageStorageUrl(normalized);
}

export function isPendingRetryImageReference(value: string): boolean {
  return value.trim().startsWith(PENDING_RETRY_IMAGE_PREFIX);
}

function parseInlineImageDataUrl(dataUrl: string): ParsedInlineImageDataUrl {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(INLINE_IMAGE_DATA_URL_REGEX);

  if (!match) {
    throw new Error('Inline image must be a base64-encoded data URL.');
  }

  const [, contentType, rawBase64] = match;
  const bytes = Buffer.from(rawBase64.replace(/\s+/g, ''), 'base64');

  if (bytes.length === 0) {
    throw new Error('Inline image data URL decoded to zero bytes.');
  }

  return {
    bytes: new Uint8Array(bytes),
    contentType,
    extension: normalizeContentTypeExtension(contentType),
    dataUrl: trimmed,
  };
}

async function uploadInlineImageDataUrl(
  supabase: Pick<SupabaseClient, 'storage'>,
  dataUrl: string,
  folderPath: string,
  cache: Map<string, string>
): Promise<string> {
  if (cache.has(dataUrl)) {
    return cache.get(dataUrl)!;
  }

  const parsed = parseInlineImageDataUrl(dataUrl);
  const hash = createHash('sha256').update(parsed.bytes).digest('hex').slice(0, 24);
  const storagePath = `${folderPath}/${hash}.${parsed.extension}`;

  const { error: uploadError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(storagePath, parsed.bytes, {
    contentType: parsed.contentType,
    cacheControl: '31536000',
    upsert: true,
  });

  if (uploadError) {
    throw new Error(`Failed to upload inline image: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);

  cache.set(parsed.dataUrl, publicUrl);

  return publicUrl;
}

function buildPendingRetryMarker(imageUrl: string, errorType: ImageErrorType): string {
  const hash = createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  return `${PENDING_RETRY_IMAGE_PREFIX}${errorType}/${hash}`;
}

function extractHttpStatusCode(message: string | null | undefined): number | null {
  if (!message) {
    return null;
  }

  const match = message.match(HTTP_STATUS_CODE_REGEX);
  if (!match) {
    return null;
  }

  const statusCode = Number.parseInt(match[1], 10);
  return Number.isNaN(statusCode) ? null : statusCode;
}

function resolveImageErrorType(
  metadata: ScraperImageCaptureResult | undefined,
  fallbackError: unknown
): ImageErrorType {
  if (metadata && isImageErrorType(metadata.error_type)) {
    return metadata.error_type;
  }

  if (fallbackError instanceof Error && /cors/i.test(fallbackError.message)) {
    return ImageCaptureErrorType.CORS_BLOCKED;
  }

  if (typeof fallbackError === 'string' && /cors/i.test(fallbackError)) {
    return ImageCaptureErrorType.CORS_BLOCKED;
  }

  const statusCode = metadata?.status_code ?? extractHttpStatusCode(metadata?.error_message) ?? (
    fallbackError instanceof Error ? extractHttpStatusCode(fallbackError.message) : null
  );

  return classifyHttpError(statusCode);
}

async function enqueueImageRetry(
  supabase: Pick<SupabaseClient, 'from'>,
  options: ReplaceInlineImageDataUrlOptions,
  cache: Map<string, QueuedInlineImageCacheEntry>,
  imageUrl: string,
  errorType: ImageErrorType,
  errorMessage: string | null | undefined
): Promise<QueuedInlineImageCacheEntry> {
  const cacheKey = `${imageUrl}|${errorType}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const captureErrorType = errorType as ImageCaptureErrorType;
  const scheduledFor = new Date(Date.now() + getRetryDelay(captureErrorType, 0)).toISOString();
  const marker = buildPendingRetryMarker(imageUrl, errorType);
  const payload: ImageRetryQueueInsert = {
    product_id: options.productId ?? null,
    image_url: imageUrl,
    error_type: errorType,
    retry_count: 0,
    max_retries: MAX_RETRIES[captureErrorType],
    status: 'pending',
    scheduled_for: scheduledFor,
    last_error: errorMessage ?? null,
  };

  const { error } = await supabase.from('image_retry_queue').insert(payload);

  if (error) {
    throw new Error(`Failed to enqueue image retry: ${error.message}`);
  }

  const queuedEntry: QueuedInlineImageCacheEntry = {
    errorType,
    imageUrl,
    marker,
    scheduledFor,
  };

  cache.set(cacheKey, queuedEntry);
  return queuedEntry;
}

export async function replaceInlineImageDataUrls<T>(
  supabase: Pick<SupabaseClient, 'from' | 'storage'>,
  value: T,
  options: ReplaceInlineImageDataUrlOptions
): Promise<ReplaceInlineImageDataUrlsResult<T>> {
  const folderPath = normalizeStorageFolderPath(options.folderPath);
  const cache = new Map<string, string>();
  const queuedImages: QueuedInlineImage[] = [];
  const queuedRetryCache = new Map<string, QueuedInlineImageCacheEntry>();
  const metadataByDataUrl = new Map<string, ScraperImageCaptureResult>();

  for (const metadata of options.scraperImageMetadata ?? []) {
    if (typeof metadata.data_url === 'string' && metadata.data_url.trim()) {
      metadataByDataUrl.set(metadata.data_url.trim(), metadata);
    }
  }

  const queueImageRetry = async (
    imageUrl: string,
    errorType: ImageErrorType,
    errorMessage: string | null | undefined,
    path: string[]
  ): Promise<string> => {
    const queuedImage = await enqueueImageRetry(supabase, options, queuedRetryCache, imageUrl, errorType, errorMessage);

    queuedImages.push({
      ...queuedImage,
      path: path.join('.') || 'root',
    });

    return queuedImage.marker;
  };

  const persistInlineImage = async (
    dataUrl: string,
    path: string[],
    metadata?: ScraperImageCaptureResult
  ): Promise<unknown> => {
    try {
      return await uploadInlineImageDataUrl(supabase, dataUrl, folderPath, cache);
    } catch (error) {
      const matchedMetadata = metadata ?? metadataByDataUrl.get(dataUrl.trim());
      const retryImageUrl = matchedMetadata?.original_url?.trim();

      if (retryImageUrl) {
        try {
          return await queueImageRetry(
            retryImageUrl,
            resolveImageErrorType(matchedMetadata, error),
            matchedMetadata?.error_message ?? (error instanceof Error ? error.message : String(error ?? 'Unknown error')),
            path
          );
        } catch (queueError) {
          options.onError?.(
            `Failed to persist inline image at ${path.join('.') || 'root'} and could not enqueue retry; keeping inline data URL for now.`,
            queueError
          );
          return dataUrl;
        }
      }

      options.onError?.(
        `Failed to persist inline image at ${path.join('.') || 'root'}; keeping inline data URL for now.`,
        error
      );
      return dataUrl;
    }
  };

  const visit = async (current: unknown, path: string[]): Promise<unknown> => {
    if (typeof current === 'string') {
      if (!isInlineImageDataUrl(current)) {
        return current;
      }

      return persistInlineImage(current, path);
    }

    if (Array.isArray(current)) {
      return Promise.all(current.map((entry, index) => visit(entry, [...path, String(index)])));
    }

    if (isRecord(current)) {
      if (isScraperImageCaptureResult(current)) {
        const currentStatus = current.status ?? (typeof current.data_url === 'string' && current.data_url.trim() ? 'success' : 'error');

        if (currentStatus === 'success' && typeof current.data_url === 'string' && current.data_url.trim()) {
          if (!isInlineImageDataUrl(current.data_url)) {
            return current.data_url;
          }

          return persistInlineImage(current.data_url, path, current);
        }

        const retryImageUrl = typeof current.original_url === 'string' ? current.original_url.trim() : undefined;
        const errorMessage = typeof current.error_message === 'string' ? current.error_message : null;
        if (!retryImageUrl) {
          options.onError?.(
            `Scraper image error at ${path.join('.') || 'root'} is missing original_url; leaving value unchanged.`,
            current
          );
          return current;
        }

        try {
          return await queueImageRetry(
            retryImageUrl,
            resolveImageErrorType(current, errorMessage),
            errorMessage,
            path
          );
        } catch (error) {
          options.onError?.(
            `Failed to enqueue scraper image retry at ${path.join('.') || 'root'}; leaving value unchanged.`,
            error
          );
          return current;
        }
      }

      const entries = await Promise.all(
        Object.entries(current).map(async ([key, entry]) => [key, await visit(entry, [...path, key])] as const)
      );

      return Object.fromEntries(entries);
    }

    return current;
  };

  return {
    value: (await visit(value, [])) as T,
    queuedImages,
  };
}
