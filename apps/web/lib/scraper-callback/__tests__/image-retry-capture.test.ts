/**
 * @jest-environment node
 */

import { httpFetchCaptureImage } from '../image-retry-capture';

describe('httpFetchCaptureImage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns success for OK response with image content-type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
    });

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/image.jpg',
      domain: 'example.com',
      scraperSlug: 'public-scraper',
    });

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('https://example.com/image.jpg');
  });

  it('returns auth_401 for 401 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://private.example.com/image.jpg',
      domain: 'private.example.com',
      scraperSlug: 'petfoodex',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('auth_401');
    expect(result.errorMessage).toBe('HTTP 401');
  });

  it('returns not_found_404 for 404 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/missing.jpg',
      domain: 'example.com',
      scraperSlug: 'public-scraper',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('not_found_404');
  });

  it('returns unknown for other HTTP errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/image.jpg',
      domain: 'example.com',
      scraperSlug: 'public-scraper',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('unknown');
  });

  it('returns unknown for non-image content-type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/image.jpg',
      domain: 'example.com',
      scraperSlug: 'public-scraper',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('unknown');
  });

  it('returns network_timeout for fetch timeout', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('The operation was aborted'));

    const result = await httpFetchCaptureImage({
      productId: 'p1',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/image.jpg',
      domain: 'example.com',
      scraperSlug: 'public-scraper',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('network_timeout');
  });
});
