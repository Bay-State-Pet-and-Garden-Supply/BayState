/**
 * @jest-environment node
 */

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyHttpError,
  getRetryDelay,
  ImageCaptureErrorType,
  shouldRetry,
} from '@/lib/image-capture-errors';
import {
  PENDING_RETRY_IMAGE_PREFIX,
  buildProductImageStorageFolder,
  isDurableProductImageReference,
  isPendingRetryImageReference,
  replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';
import {
  ImageRetryProcessor,
  type ImageRetryCaptureResult,
  type ImageRetryEntry,
  resolveImageRetryTarget,
} from '@/lib/scraper-callback/image-retry-processor';

const FIXED_NOW_ISO = '2026-03-26T12:00:00.000Z';
const FIXED_NOW = new Date(FIXED_NOW_ISO);
const INLINE_IMAGE_ONE = 'data:image/png;base64,AQ==';
const INLINE_IMAGE_TWO = 'data:image/png;base64,Ag==';
const INLINE_IMAGE_THREE = 'data:image/png;base64,Aw==';

type StorageInsert = Record<string, unknown>;

function buildPendingMarker(imageUrl: string, errorType: string): string {
  const hash = createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  return `${PENDING_RETRY_IMAGE_PREFIX}${errorType}/${hash}`;
}

function createRetryEntry(overrides: Partial<ImageRetryEntry> = {}): ImageRetryEntry {
  return {
    retry_id: 'retry-1',
    sku: 'SKU-001',
    image_url: 'https://private.example.com/protected.jpg',
    error_type: 'network_timeout',
    retry_count: 0,
    max_retries: 3,
    last_error: null,
    ...overrides,
  };
}

function createStorageSupabaseMock(options: {
  insertImpl?: (payload: StorageInsert) => Promise<{ error: { message: string } | null }>;
} = {}) {
  const retryQueueInserts: StorageInsert[] = [];
  const upload = jest.fn(async (storagePath: string) => ({ error: null }));
  const getPublicUrl = jest.fn((storagePath: string) => ({
    data: {
      publicUrl: `https://supabase.example.com/storage/v1/object/public/product-images/${storagePath}`,
    },
  }));

  const insert = jest.fn(async (payload: StorageInsert) => {
    retryQueueInserts.push(payload);
    if (options.insertImpl) {
      return options.insertImpl(payload);
    }

    return { error: null };
  });

  return {
    supabase: {
      storage: {
        from: jest.fn(() => ({
          upload,
          getPublicUrl,
        })),
      },
      from: jest.fn((table: string) => {
        if (table !== 'image_retry_queue') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return { insert };
      }),
    },
    retryQueueInserts,
    upload,
    getPublicUrl,
  };
}

function createProcessorSupabaseMock(options: {
  sources?: Record<string, unknown>;
  requiresLogin?: boolean;
  queueEntries?: ImageRetryEntry[];
} = {}) {
  const retryQueueUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const productUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const sources = options.sources ?? {
    phillips: {
      images: [buildPendingMarker('https://private.example.com/protected.jpg', 'network_timeout')],
    },
  };
  const requiresLogin = options.requiresLogin ?? true;

  return {
    retryQueueUpdates,
    productUpdates,
    supabase: {
      rpc: jest.fn().mockResolvedValue({ data: options.queueEntries ?? [], error: null }),
      from: jest.fn((table: string) => {
        if (table === 'image_retry_queue') {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: async (_column: string, id: string) => {
                retryQueueUpdates.push({ id, payload });
                return { error: null };
              },
            }),
          };
        }

        if (table === 'products_ingestion') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    sku: 'SKU-1',
                    sources,
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async (_column: string, id: string) => {
                productUpdates.push({ id, payload });
                return { error: null };
              },
            }),
          };
        }

        if (table === 'scraper_configs') {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    slug: 'phillips',
                    file_path: 'scrapers/configs/phillips.yaml',
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    requiresLogin,
  };
}

async function queueInitialFailure(options: {
  errorType: 'auth_401' | 'not_found_404' | 'network_timeout' | 'cors_blocked';
  errorMessage: string;
  imageUrl?: string;
}) {
  const storage = createStorageSupabaseMock();
  const imageUrl = options.imageUrl ?? 'https://private.example.com/protected.jpg';
  const result = await replaceInlineImageDataUrls(
    storage.supabase as never,
    {
      images: [
        {
          status: 'error' as const,
          error_type: options.errorType,
          error_message: options.errorMessage,
          original_url: imageUrl,
        },
      ],
    },
    {
      folderPath: 'pipeline-sources/sku-1',
      productId: 'SKU-1',
    }
  );

  const marker = result.value.images[0];
  if (typeof marker !== 'string') {
    throw new Error('Expected queued retry marker to be a string');
  }

  return {
    storage,
    marker,
    queuedInsert: storage.retryQueueInserts[0],
    queuedImages: result.queuedImages,
  };
}

describe('image retry flow integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('stores a successfully captured inline image without queueing a retry', async () => {
    const storage = createStorageSupabaseMock();

    const result = await replaceInlineImageDataUrls(
      storage.supabase as never,
      { images: [INLINE_IMAGE_ONE] },
      { folderPath: 'pipeline-sources/sku-1' }
    );

    expect(result.queuedImages).toEqual([]);
    expect(result.value).toEqual({
      images: [
        expect.stringContaining('/storage/v1/object/public/product-images/pipeline-sources/sku-1/'),
      ],
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.retryQueueInserts).toEqual([]);
  });

  it('queues a 401 image failure, re-authenticates, and stores the retried image', async () => {
    const queued = await queueInitialFailure({
      errorType: 'auth_401',
      errorMessage: 'HTTP 401',
    });
    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          images: [queued.marker],
        },
      },
    });
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: true,
      imageUrl: 'https://cdn.example.com/auth-success.jpg',
    }));
    const readBrowserSession = jest
      .fn()
      .mockResolvedValueOnce({
        sessionExpiresAt: '2026-03-26T11:55:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })
      .mockResolvedValueOnce({
        sessionExpiresAt: '2026-03-26T13:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      });
    const reauthenticate = jest.fn(async () => ({
      sessionExpiresAt: '2026-03-26T13:00:00.000Z',
      storageStatePath: 'C:/browser-state/phillips.json',
    }));

    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession,
      reauthenticate,
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const status = await processor.processRetry(
      createRetryEntry({
        error_type: 'auth_401',
        image_url: 'https://private.example.com/protected.jpg',
        max_retries: 2,
      })
    );

    expect(queued.queuedInsert).toEqual(
      expect.objectContaining({
        sku: 'SKU-1',
        image_url: 'https://private.example.com/protected.jpg',
        error_type: 'auth_401',
        status: 'pending',
      })
    );
    expect(status).toBe('completed');
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(captureImage).toHaveBeenCalledWith({
      productId: 'SKU-1',
      sku: 'SKU-1',
      imageUrl: 'https://private.example.com/protected.jpg',
      domain: 'private.example.com',
      scraperSlug: 'phillips',
    });
    expect(processorMock.productUpdates[0]).toEqual({
      id: 'SKU-1',
      payload: {
        sources: {
          phillips: {
            images: ['https://cdn.example.com/auth-success.jpg'],
          },
        },
        updated_at: FIXED_NOW_ISO,
      },
    });
    expect(processorMock.retryQueueUpdates.at(-1)).toEqual({
      id: 'retry-1',
      payload: {
        status: 'completed',
        last_error: null,
        updated_at: FIXED_NOW_ISO,
      },
    });
  });

  it('queues a 404 image failure and marks it as permanently failed without retrying', async () => {
    const queued = await queueInitialFailure({
      errorType: 'not_found_404',
      errorMessage: 'HTTP 404',
    });
    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          images: [queued.marker],
        },
      },
    });
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.NOT_FOUND_404,
      errorMessage: 'HTTP 404',
    }));

    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const status = await processor.processRetry(
      createRetryEntry({
        error_type: 'not_found_404',
        max_retries: 0,
      })
    );

    expect(queued.queuedInsert).toEqual(
      expect.objectContaining({
        error_type: 'not_found_404',
        status: 'pending',
      })
    );
    expect(status).toBe('failed');
    expect(processorMock.retryQueueUpdates.at(-1)).toEqual({
      id: 'retry-1',
      payload: {
        error_type: 'not_found_404',
        retry_count: 1,
        status: 'failed',
        last_error: 'HTTP 404',
        updated_at: FIXED_NOW_ISO,
      },
    });
  });

  it('queues a timeout, reschedules with backoff, and succeeds on the next retry', async () => {
    const queued = await queueInitialFailure({
      errorType: 'network_timeout',
      errorMessage: 'Request timed out',
    });
    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          images: [queued.marker],
        },
      },
    });
    const captureImage = jest
      .fn<Promise<ImageRetryCaptureResult>, []>()
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: true,
        imageUrl: 'https://cdn.example.com/timeout-recovered.jpg',
      });

    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const firstStatus = await processor.processRetry(createRetryEntry());
    const secondStatus = await processor.processRetry(
      createRetryEntry({
        retry_count: 1,
        last_error: 'Request timed out',
      })
    );

    expect(firstStatus).toBe('rescheduled');
    expect(processorMock.retryQueueUpdates[1]).toEqual({
      id: 'retry-1',
      payload: {
        error_type: 'network_timeout',
        retry_count: 1,
        status: 'pending',
        scheduled_for: '2026-03-26T12:00:01.000Z',
        last_error: 'Request timed out',
        updated_at: FIXED_NOW_ISO,
      },
    });
    expect(secondStatus).toBe('completed');
    expect(processorMock.productUpdates.at(-1)).toEqual({
      id: 'SKU-1',
      payload: {
        sources: {
          phillips: {
            images: ['https://cdn.example.com/timeout-recovered.jpg'],
          },
        },
        updated_at: FIXED_NOW_ISO,
      },
    });
  });

  it('queues a CORS failure and permanently fails it after the retry attempt', async () => {
    const queued = await queueInitialFailure({
      errorType: 'cors_blocked',
      errorMessage: 'CORS blocked by browser policy',
    });
    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          images: [queued.marker],
        },
      },
    });
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.CORS_BLOCKED,
      errorMessage: 'CORS blocked by browser policy',
    }));

    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const status = await processor.processRetry(
      createRetryEntry({
        error_type: 'cors_blocked',
        max_retries: 1,
      })
    );

    expect(queued.queuedInsert).toEqual(
      expect.objectContaining({
        error_type: 'cors_blocked',
        max_retries: 1,
      })
    );
    expect(status).toBe('failed');
    expect(processorMock.retryQueueUpdates.at(-1)).toEqual({
      id: 'retry-1',
      payload: {
        error_type: 'cors_blocked',
        retry_count: 1,
        status: 'failed',
        last_error: 'CORS blocked by browser policy',
        updated_at: FIXED_NOW_ISO,
      },
    });
  });

  it('marks partial products for retry by preserving successful uploads and failed retry markers together', async () => {
    const storage = createStorageSupabaseMock();

    const result = await replaceInlineImageDataUrls(
      storage.supabase as never,
      {
        phillips: {
          images: [
            INLINE_IMAGE_ONE,
            INLINE_IMAGE_TWO,
            INLINE_IMAGE_THREE,
            {
              status: 'error',
              error_type: 'network_timeout',
              error_message: 'Request timed out',
              original_url: 'https://private.example.com/fail-1.jpg',
            },
            {
              status: 'error',
              error_type: 'auth_401',
              error_message: 'HTTP 401',
              original_url: 'https://private.example.com/fail-2.jpg',
            },
          ],
        },
      },
      {
        folderPath: 'pipeline-sources/sku-1',
        productId: 'product-1',
      }
    );

    expect(storage.retryQueueInserts).toHaveLength(2);
    expect(result.value).toEqual({
      phillips: {
        images: [
          expect.stringContaining('/storage/v1/object/public/product-images/pipeline-sources/sku-1/'),
          expect.stringContaining('/storage/v1/object/public/product-images/pipeline-sources/sku-1/'),
          expect.stringContaining('/storage/v1/object/public/product-images/pipeline-sources/sku-1/'),
          expect.stringMatching(/^pending_retry:\/\/network_timeout\//),
          expect.stringMatching(/^pending_retry:\/\/auth_401\//),
        ],
      },
    });
    expect(result.queuedImages).toEqual([
      {
        errorType: 'network_timeout',
        imageUrl: 'https://private.example.com/fail-1.jpg',
        marker: expect.stringMatching(/^pending_retry:\/\/network_timeout\//),
        path: 'phillips.images.3',
        scheduledFor: '2026-03-26T12:00:01.000Z',
      },
      {
        errorType: 'auth_401',
        imageUrl: 'https://private.example.com/fail-2.jpg',
        marker: expect.stringMatching(/^pending_retry:\/\/auth_401\//),
        path: 'phillips.images.4',
        scheduledFor: '2026-03-26T12:00:01.000Z',
      },
    ]);
  });

  it('covers retry classification utilities for auth, timeout, CORS, and permanent failures', () => {
    expect(classifyHttpError(401)).toBe(ImageCaptureErrorType.AUTH_401);
    expect(classifyHttpError(404)).toBe(ImageCaptureErrorType.NOT_FOUND_404);
    expect(classifyHttpError(null)).toBe(ImageCaptureErrorType.NETWORK_TIMEOUT);
    expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 1, 2)).toBe(true);
    expect(shouldRetry(ImageCaptureErrorType.CORS_BLOCKED, 1, 1)).toBe(false);
    expect(shouldRetry(ImageCaptureErrorType.NOT_FOUND_404, 0, 0)).toBe(false);
    expect(getRetryDelay(ImageCaptureErrorType.NETWORK_TIMEOUT, 2)).toBe(4000);
  });

  it('uses the default browser session reader to parse persisted cookie expiry', async () => {
    const storageStateDirectory = path.join(process.cwd(), 'apps', 'scraper', '.browser_storage_states');
    const storageStatePath = path.join(storageStateDirectory, 'phillips--shop-phillipspet-com.json');
    mkdirSync(storageStateDirectory, { recursive: true });
    writeFileSync(
      storageStatePath,
      JSON.stringify({
        cookies: [
          { name: 'short', expires: 1774530000 },
          { name: 'long', expires: 1774533600 },
        ],
      })
    );

    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          images: [buildPendingMarker('https://private.example.com/protected.jpg', 'auth_401')],
        },
      },
    });
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: true,
      imageUrl: 'https://cdn.example.com/default-session-success.jpg',
    }));

    try {
      const processor = new ImageRetryProcessor({
        supabase: processorMock.supabase as never,
        captureImage,
        reauthenticate: jest.fn(async () => ({
          sessionExpiresAt: '2026-03-26T14:00:00.000Z',
          storageStatePath,
        })),
        now: () => FIXED_NOW,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      await expect(
        processor.processRetry(
          createRetryEntry({
            error_type: 'auth_401',
            image_url: 'https://private.example.com/protected.jpg',
            max_retries: 2,
          })
        )
      ).resolves.toBe('completed');
    } finally {
      rmSync(storageStatePath, { force: true });
    }
  });

  it('surfaces missing default processor dependencies when no overrides are provided', async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      expect(() => new ImageRetryProcessor()).toThrow('Missing Supabase configuration');

      const processorMock = createProcessorSupabaseMock();
      const processor = new ImageRetryProcessor({
        supabase: processorMock.supabase as never,
        now: () => FIXED_NOW,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      await expect(processor.processRetry(createRetryEntry())).resolves.toBe('rescheduled');
    } finally {
      if (originalUrl) {
        process.env.SUPABASE_URL = originalUrl;
      }
      if (originalKey) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
    }
  });

  it('deduplicates retry queue inserts when the same image failure is encountered concurrently', async () => {
    const dedupedKeys = new Set<string>();
    const storage = createStorageSupabaseMock({
      insertImpl: async (payload) => {
        await Promise.resolve();
        dedupedKeys.add(`${payload.sku}|${payload.image_url}|${payload.error_type}`);
        return { error: null };
      },
    });

    const result = await replaceInlineImageDataUrls(
      storage.supabase as never,
      {
        images: [
          {
            status: 'error',
            error_type: 'network_timeout',
            error_message: 'Request timed out',
            original_url: 'https://private.example.com/duplicate.jpg',
          },
          {
            status: 'error',
            error_type: 'network_timeout',
            error_message: 'Request timed out',
            original_url: 'https://private.example.com/duplicate.jpg',
          },
        ],
      },
    {
      folderPath: 'pipeline-sources/sku-1',
      productId: 'SKU-1',
    }
  );

  expect(storage.retryQueueInserts).toHaveLength(1);
  expect(dedupedKeys).toEqual(new Set(['SKU-1|https://private.example.com/duplicate.jpg|network_timeout']));
    expect(result.queuedImages).toHaveLength(2);
    expect(result.value).toEqual({
      images: [result.value.images[0], result.value.images[0]],
    });
  });

  it('opens the circuit breaker after repeated retry failures and stops retrying the domain', async () => {
    const processorMock = createProcessorSupabaseMock();
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
      errorMessage: 'Request timed out',
    }));
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
      logger,
    });

    for (let index = 0; index < 5; index += 1) {
      await processor.processRetry(createRetryEntry({ retry_id: `retry-${index + 1}` }));
    }

    const status = await processor.processRetry(createRetryEntry({ retry_id: 'retry-6' }));

    expect(status).toBe('circuit-open');
    expect(processorMock.retryQueueUpdates.at(-1)).toEqual({
      id: 'retry-6',
      payload: {
        status: 'pending',
        scheduled_for: '2026-03-26T12:05:00.000Z',
        last_error: 'Circuit breaker open for private.example.com',
        updated_at: FIXED_NOW_ISO,
      },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns zero poll results when no queued retries are available', async () => {
    const processorMock = createProcessorSupabaseMock({ queueEntries: [] });
    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage: jest.fn(),
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    await expect(processor.pollAndProcess()).resolves.toEqual({
      fetched: 0,
      processed: 0,
      completed: 0,
      failed: 0,
      rescheduled: 0,
      skippedCircuitOpen: 0,
    });
  });

  it('aggregates mixed pollAndProcess outcomes across a batch', async () => {
    const entries = [
      createRetryEntry({ retry_id: 'retry-1' }),
      createRetryEntry({ retry_id: 'retry-2' }),
      createRetryEntry({ retry_id: 'retry-3' }),
      createRetryEntry({ retry_id: 'retry-4' }),
    ];
    const processorMock = createProcessorSupabaseMock({ queueEntries: entries });
    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage: jest.fn(),
      now: () => FIXED_NOW,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    jest
      .spyOn(processor, 'processRetry')
      .mockResolvedValueOnce('completed')
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('rescheduled')
      .mockResolvedValueOnce('circuit-open');

    await expect(processor.pollAndProcess()).resolves.toEqual({
      fetched: 4,
      processed: 4,
      completed: 1,
      failed: 1,
      rescheduled: 1,
      skippedCircuitOpen: 1,
    });
  });

  it('closes an open circuit once the cooldown window has elapsed', async () => {
    let now = new Date(FIXED_NOW);
    const processorMock = createProcessorSupabaseMock();
    const captureImage = jest
      .fn<Promise<ImageRetryCaptureResult>, []>()
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: 'Request timed out',
      })
      .mockResolvedValueOnce({
        success: true,
        imageUrl: 'https://cdn.example.com/recovered-after-cooldown.jpg',
      });
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const processor = new ImageRetryProcessor({
      supabase: processorMock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => now,
      logger,
    });

    for (let index = 0; index < 5; index += 1) {
      await processor.processRetry(createRetryEntry({ retry_id: `retry-cooldown-${index}` }));
    }

    now = new Date('2026-03-26T12:05:01.000Z');
    const status = await processor.processRetry(createRetryEntry({ retry_id: 'retry-after-cooldown' }));

    expect(status).toBe('completed');
    expect(logger.info).toHaveBeenCalledWith('[ImageRetryProcessor] Closed circuit for private.example.com');
  });

  it('resolves login-protected retry targets and returns null for missing products', async () => {
    const processorMock = createProcessorSupabaseMock({
      sources: {
        phillips: {
          gallery: [{ url: 'https://private.example.com/protected.jpg' }],
        },
      },
    });

    const target = await resolveImageRetryTarget(
      processorMock.supabase as never,
      'SKU-1',
      'https://private.example.com/protected.jpg'
    );

    expect(target).toEqual(
      expect.objectContaining({
        productId: 'SKU-1',
        sku: 'SKU-1',
        matchedSourceNames: ['phillips'],
        requiresLogin: true,
      })
    );

    const missingTarget = await resolveImageRetryTarget(
      {
        from: jest.fn(() => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'not found' } }),
            }),
          }),
        })),
      } as never,
      'missing-product',
      'https://private.example.com/protected.jpg'
    );

    expect(missingTarget).toBeNull();
  });

  it('normalizes product image folders and durable image markers', async () => {
    expect(buildProductImageStorageFolder(' Pipeline Sources ', 'SKU 1 ')).toBe('pipeline-sources/sku-1');
    expect(
      isDurableProductImageReference(
        'https://supabase.example.com/storage/v1/object/public/product-images/pipeline-sources/sku-1/image.png'
      )
    ).toBe(true);
    expect(isPendingRetryImageReference('pending_retry://network_timeout/abc123')).toBe(true);
    expect(isDurableProductImageReference('https://private.example.com/raw-image.jpg')).toBe(false);
  });

  it('keeps failed uploads inline when retry metadata is unavailable and preserves malformed scraper errors', async () => {
    const onError = jest.fn();
    const storage = createStorageSupabaseMock({
      insertImpl: async () => ({ error: { message: 'should not insert' } }),
    });
    storage.upload.mockResolvedValue({ error: { message: 'Storage service returned 500' } } as never);

    const uploadResult = await replaceInlineImageDataUrls(
      storage.supabase as never,
      { images: [INLINE_IMAGE_ONE] },
      {
        folderPath: 'pipeline-sources/sku-1',
        onError,
      }
    );

    const malformedResult = await replaceInlineImageDataUrls(
      createStorageSupabaseMock().supabase as never,
      {
        images: [
          {
            status: 'error',
            error_type: 'network_timeout',
            error_message: 'Request timed out',
          },
        ],
      },
      {
        folderPath: 'pipeline-sources/sku-1',
        onError,
      }
    );

    expect(uploadResult.value).toEqual({ images: [INLINE_IMAGE_ONE] });
    expect(uploadResult.queuedImages).toEqual([]);
    expect(malformedResult.value).toEqual({
      images: [
        {
          status: 'error',
          error_type: 'network_timeout',
          error_message: 'Request timed out',
        },
      ],
    });
    expect(onError).toHaveBeenCalled();
  });
});
