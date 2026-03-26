import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

const INLINE_IMAGE_DATA_URL_REGEX = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

interface ParsedInlineImageDataUrl {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  dataUrl: string;
}

interface ReplaceInlineImageDataUrlOptions {
  folderPath: string;
  onError?: (message: string, error: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

export async function replaceInlineImageDataUrls<T>(
  supabase: Pick<SupabaseClient, 'storage'>,
  value: T,
  options: ReplaceInlineImageDataUrlOptions
): Promise<T> {
  const folderPath = normalizeStorageFolderPath(options.folderPath);
  const cache = new Map<string, string>();

  const visit = async (current: unknown, path: string[]): Promise<unknown> => {
    if (typeof current === 'string') {
      if (!isInlineImageDataUrl(current)) {
        return current;
      }

      try {
        return await uploadInlineImageDataUrl(supabase, current, folderPath, cache);
      } catch (error) {
        options.onError?.(
          `Failed to persist inline image at ${path.join('.') || 'root'}; keeping inline data URL for now.`,
          error
        );
        return current;
      }
    }

    if (Array.isArray(current)) {
      return Promise.all(current.map((entry, index) => visit(entry, [...path, String(index)])));
    }

    if (isRecord(current)) {
      const entries = await Promise.all(
        Object.entries(current).map(async ([key, entry]) => [key, await visit(entry, [...path, key])] as const)
      );

      return Object.fromEntries(entries);
    }

    return current;
  };

  return (await visit(value, [])) as T;
}
