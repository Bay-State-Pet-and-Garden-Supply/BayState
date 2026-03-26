import { createHash } from 'node:crypto';
import {
  ImageCaptureErrorType,
} from '@/lib/image-capture-errors';
import {
  ImageRetryProcessor,
  type ImageRetryCaptureResult,
  type ImageRetryEntry,
} from '@/lib/scraper-callback/image-retry-processor';

const FIXED_NOW = new Date('2026-03-26T12:00:00.000Z');
const AUTH_METADATA_PREFIX = '[image-retry-auth]';

function buildMarker(imageUrl: string, errorType: string): string {
  const hash = createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  return `pending_retry://${errorType}/${hash}`;
}

function createEntry(overrides: Partial<ImageRetryEntry> = {}): ImageRetryEntry {
  return {
    retry_id: 'retry-1',
    product_id: 'product-1',
    image_url: 'https://private.example.com/protected.jpg',
    error_type: 'network_timeout',
    retry_count: 0,
    max_retries: 3,
    ...overrides,
  };
}

function buildAuthLastError(message: string, reloginAttempts: number, sessionExpiresAt: string | null): string {
  return `${AUTH_METADATA_PREFIX}${JSON.stringify({
    message,
    auth: {
      reloginAttempts,
      sessionExpiresAt,
    },
  })}`;
}

function createSupabaseMock(entries: ImageRetryEntry[]) {
  const retryQueueUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const productUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const rpc = jest.fn().mockResolvedValue({ data: entries, error: null });

  const from = jest.fn((table: string) => {
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
                id: 'product-1',
                sku: 'SKU-1',
                sources: {
                  phillips: {
                    images: [
                      'https://private.example.com/protected.jpg',
                      buildMarker('https://private.example.com/protected.jpg', 'network_timeout'),
                    ],
                  },
                },
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
  });

  return {
    supabase: { rpc, from },
    rpc,
    from,
    retryQueueUpdates,
    productUpdates,
  };
}

describe('ImageRetryProcessor', () => {
  it('polls pending retries and marks successful recaptures as completed', async () => {
    const entry = createEntry();
    const mock = createSupabaseMock([entry]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: true,
      imageUrl: 'https://cdn.example.com/new-image.jpg',
    }));

    const processor = new ImageRetryProcessor({
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
    });

    const result = await processor.pollAndProcess();

    expect(mock.rpc).toHaveBeenCalledWith('get_pending_image_retries', { p_limit: 10 });
    expect(captureImage).toHaveBeenCalledWith({
      productId: 'product-1',
      sku: 'SKU-1',
      imageUrl: 'https://private.example.com/protected.jpg',
      domain: 'private.example.com',
      scraperSlug: 'phillips',
    });
    expect(mock.productUpdates).toEqual([
      {
        id: 'product-1',
        payload: {
          sources: {
            phillips: {
              images: [
                'https://cdn.example.com/new-image.jpg',
                'https://cdn.example.com/new-image.jpg',
              ],
            },
          },
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
    ]);
    expect(mock.retryQueueUpdates).toEqual([
      {
        id: 'retry-1',
        payload: {
          status: 'processing',
          last_error: null,
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
      {
        id: 'retry-1',
        payload: {
          status: 'completed',
          last_error: null,
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
    ]);
    expect(result).toEqual({
      fetched: 1,
      processed: 1,
      completed: 1,
      failed: 0,
      rescheduled: 0,
      skippedCircuitOpen: 0,
    });
  });

  it('reschedules retryable failures with exponential backoff', async () => {
    const entry = createEntry();
    const mock = createSupabaseMock([]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
      errorMessage: 'Request timed out',
    }));

    const processor = new ImageRetryProcessor({
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
    });

    const status = await processor.processRetry(entry);

    expect(status).toBe('rescheduled');
    expect(mock.retryQueueUpdates).toEqual([
      {
        id: 'retry-1',
        payload: {
          status: 'processing',
          last_error: null,
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
      {
        id: 'retry-1',
        payload: {
          error_type: 'network_timeout',
          retry_count: 1,
          status: 'pending',
          scheduled_for: '2026-03-26T12:00:01.000Z',
          last_error: 'Request timed out',
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
    ]);
  });

  it('marks 404 retries as permanently failed', async () => {
    const entry = createEntry({ error_type: 'not_found_404' });
    const mock = createSupabaseMock([]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.NOT_FOUND_404,
      errorMessage: 'HTTP 404',
    }));

    const processor = new ImageRetryProcessor({
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
    });

    const status = await processor.processRetry(entry);

    expect(status).toBe('failed');
    expect(mock.retryQueueUpdates[1]).toEqual({
      id: 'retry-1',
      payload: {
        error_type: 'not_found_404',
        retry_count: 1,
        status: 'failed',
        last_error: 'HTTP 404',
        updated_at: '2026-03-26T12:00:00.000Z',
      },
    });
  });

  it('opens circuit breaker after repeated domain failures and skips next retries', async () => {
    const mock = createSupabaseMock([]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
      errorMessage: 'timeout',
    }));

    const processor = new ImageRetryProcessor({
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession: jest.fn(async () => ({
        sessionExpiresAt: '2026-03-26T14:00:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      })),
      now: () => FIXED_NOW,
    });

    for (let index = 0; index < 5; index += 1) {
      await processor.processRetry(createEntry({ retry_id: `retry-${index + 1}` }));
    }

    const status = await processor.processRetry(createEntry({ retry_id: 'retry-6' }));

    expect(status).toBe('circuit-open');
    expect(mock.retryQueueUpdates[mock.retryQueueUpdates.length - 1]).toEqual({
      id: 'retry-6',
      payload: {
        status: 'pending',
        scheduled_for: '2026-03-26T12:05:00.000Z',
        last_error: 'Circuit breaker open for private.example.com',
        updated_at: '2026-03-26T12:00:00.000Z',
      },
    });
  });

  it('re-authenticates expired auth sessions before retrying capture', async () => {
    const entry = createEntry({ error_type: 'auth_401' });
    const mock = createSupabaseMock([]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: true,
      imageUrl: 'https://cdn.example.com/refreshed-image.jpg',
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
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession,
      reauthenticate,
      now: () => FIXED_NOW,
    });

    const status = await processor.processRetry(entry);

    expect(status).toBe('completed');
    expect(reauthenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'SKU-1',
        scraper: expect.objectContaining({
          slug: 'phillips',
          requiresLogin: true,
        }),
      }),
      {
        sessionExpiresAt: '2026-03-26T11:55:00.000Z',
        storageStatePath: 'C:/browser-state/phillips.json',
      }
    );
    expect(captureImage).toHaveBeenCalledTimes(1);
    expect(mock.retryQueueUpdates).toEqual([
      {
        id: 'retry-1',
        payload: {
          status: 'processing',
          last_error: null,
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
      {
        id: 'retry-1',
        payload: {
          status: 'completed',
          last_error: null,
          updated_at: '2026-03-26T12:00:00.000Z',
        },
      },
    ]);
  });

  it('fails auth retries after two relogin attempts', async () => {
    const entry = createEntry({
      error_type: 'auth_401',
      last_error: buildAuthLastError('Previous auth failure', 2, '2026-03-26T11:50:00.000Z'),
    });
    const mock = createSupabaseMock([]);
    const captureImage = jest.fn(async (): Promise<ImageRetryCaptureResult> => ({
      success: false,
      errorType: ImageCaptureErrorType.AUTH_401,
      errorMessage: 'HTTP 401',
    }));
    const readBrowserSession = jest.fn(async () => ({
      sessionExpiresAt: '2026-03-26T11:55:00.000Z',
      storageStatePath: 'C:/browser-state/phillips.json',
    }));
    const reauthenticate = jest.fn();

    const processor = new ImageRetryProcessor({
      supabase: mock.supabase as never,
      captureImage,
      readBrowserSession,
      reauthenticate,
      now: () => FIXED_NOW,
    });

    const status = await processor.processRetry(entry);

    expect(status).toBe('failed');
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(captureImage).toHaveBeenCalledTimes(1);
    expect(mock.retryQueueUpdates[1]).toEqual({
      id: 'retry-1',
      payload: {
        error_type: 'auth_401',
        retry_count: 1,
        status: 'failed',
        last_error: buildAuthLastError('HTTP 401', 2, '2026-03-26T11:55:00.000Z'),
        updated_at: '2026-03-26T12:00:00.000Z',
      },
    });
  });
});
