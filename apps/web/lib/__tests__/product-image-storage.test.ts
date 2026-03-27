import {
  PENDING_RETRY_IMAGE_PREFIX,
  replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';

const INLINE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

function createSupabaseMock({
  uploadError = null,
}: {
  uploadError?: { message: string } | null;
} = {}) {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const upload = jest.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrl = jest.fn().mockReturnValue({
    data: {
      publicUrl: 'https://supabase.example.com/storage/v1/object/public/product-images/folder/uploaded.png',
    },
  });

  const storageFrom = jest.fn().mockReturnValue({ upload, getPublicUrl });
  const from = jest.fn().mockImplementation((table: string) => {
    if (table !== 'image_retry_queue') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return { insert };
  });

  return {
    supabase: {
      storage: { from: storageFrom },
      from,
    },
    insert,
    upload,
    getPublicUrl,
  };
}

describe('replaceInlineImageDataUrls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-26T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps successful uploads unchanged apart from replacing the data URL', async () => {
    const { supabase, insert, upload, getPublicUrl } = createSupabaseMock();

    const result = await replaceInlineImageDataUrls(
      supabase as never,
      { images: [INLINE_PNG_DATA_URL] },
      { folderPath: 'pipeline-sources/test-sku' }
    );

    expect(result.value).toEqual({
      images: ['https://supabase.example.com/storage/v1/object/public/product-images/folder/uploaded.png'],
    });
    expect(result.queuedImages).toEqual([]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(getPublicUrl).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it('queues upload failures when scraper metadata includes the protected source URL', async () => {
    const { supabase, insert, upload } = createSupabaseMock({
      uploadError: { message: 'Storage service returned 500' },
    });

    const result = await replaceInlineImageDataUrls(
      supabase as never,
      { images: [INLINE_PNG_DATA_URL] },
      {
        folderPath: 'pipeline-sources/test-sku',
        productId: 'product-123',
        scraperImageMetadata: [
          {
            status: 'success',
            data_url: INLINE_PNG_DATA_URL,
            original_url: 'https://private.example.com/protected-image.jpg',
          },
        ],
      }
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      sku: 'product-123',
      image_url: 'https://private.example.com/protected-image.jpg',
      error_type: 'unknown',
      retry_count: 0,
      max_retries: 2,
      status: 'pending',
      scheduled_for: '2026-03-26T12:00:01.000Z',
      last_error: 'Failed to upload inline image: Storage service returned 500',
    });
    expect(result.value).toEqual({
      images: [expect.stringMatching(new RegExp(`^${PENDING_RETRY_IMAGE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}unknown/`))],
    });
    expect(result.queuedImages).toEqual([
      {
        errorType: 'unknown',
        imageUrl: 'https://private.example.com/protected-image.jpg',
        marker: expect.stringMatching(/^pending_retry:\/\/unknown\//),
        path: 'images.0',
        scheduledFor: '2026-03-26T12:00:01.000Z',
      },
    ]);
  });

  it('queues structured scraper error metadata without attempting an upload', async () => {
    const { supabase, insert, upload } = createSupabaseMock();

    const result = await replaceInlineImageDataUrls(
      supabase as never,
      {
        images: [
          {
            status: 'error',
            error_type: 'auth_401',
            error_message: 'HTTP 401',
            original_url: 'https://private.example.com/auth-image.jpg',
          },
        ],
      },
      {
        folderPath: 'pipeline-sources/test-sku',
        productId: 'product-456',
      }
    );

    expect(upload).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      sku: 'product-456',
      image_url: 'https://private.example.com/auth-image.jpg',
      error_type: 'auth_401',
      retry_count: 0,
      max_retries: 2,
      status: 'pending',
      scheduled_for: '2026-03-26T12:00:01.000Z',
      last_error: 'HTTP 401',
    });
    expect(result.value).toEqual({
      images: [expect.stringMatching(/^pending_retry:\/\/auth_401\//)],
    });
    expect(result.queuedImages).toEqual([
      {
        errorType: 'auth_401',
        imageUrl: 'https://private.example.com/auth-image.jpg',
        marker: expect.stringMatching(/^pending_retry:\/\/auth_401\//),
        path: 'images.0',
        scheduledFor: '2026-03-26T12:00:01.000Z',
      },
    ]);
  });
});
