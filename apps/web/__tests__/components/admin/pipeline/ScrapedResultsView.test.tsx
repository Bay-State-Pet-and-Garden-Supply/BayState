/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScrapedResultsView } from '@/components/admin/pipeline/ScrapedResultsView';
import type { PipelineProduct } from '@/lib/pipeline/types';

const fetchMock = jest.fn();

function makeProducts(suffix: string): PipelineProduct[] {
  return [
    {
      id: `product-${suffix}`,
      sku: `SKU-${suffix}`,
      input: { name: 'Broken Product', price: 12.5 },
      sources: {
        protected: {
          title: 'Protected Product',
          image_url: `https://images.example.com/${suffix}-broken-primary.jpg`,
          images: [
            `https://images.example.com/${suffix}-broken-primary.jpg`,
            `https://images.example.com/${suffix}-broken-secondary.jpg`,
          ],
        },
      },
      consolidated: { name: 'Broken Product' },
      pipeline_status: 'scraped',
      created_at: '2026-03-26T00:00:00.000Z',
      updated_at: '2026-03-26T00:00:00.000Z',
    },
  ];
}

describe('ScrapedResultsView', () => {
  beforeAll(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-26T12:00:00.000Z'));
    fetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ accepted: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
    jest.useRealTimers();
  });

  it('queues a retry when the primary image fails to load', async () => {
    const products = makeProducts('primary');

    render(
      <ScrapedResultsView
        products={products}
        selectedSkus={new Set()}
        onSelectSku={jest.fn()}
        onRefresh={jest.fn()}
      />
    );

    fireEvent.error(screen.getByTestId('scraped-primary-image'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/scraping/retry-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'product-primary',
          image_url: 'https://images.example.com/primary-broken-primary.jpg',
        }),
      });
    });
  });

  it('debounces duplicate retry requests for the same image within five minutes', async () => {
    const products = makeProducts('debounce');

    render(
      <ScrapedResultsView
        products={products}
        selectedSkus={new Set()}
        onSelectSku={jest.fn()}
        onRefresh={jest.fn()}
      />
    );

    const image = screen.getByTestId('scraped-primary-image');

    fireEvent.error(image);
    fireEvent.error(image);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    fireEvent.error(image);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('queues retries for secondary image failures too', async () => {
    const products = makeProducts('secondary');

    render(
      <ScrapedResultsView
        products={products}
        selectedSkus={new Set()}
        onSelectSku={jest.fn()}
        onRefresh={jest.fn()}
      />
    );

    fireEvent.error(screen.getByTestId('scraped-secondary-image-0'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/scraping/retry-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'product-secondary',
          image_url: 'https://images.example.com/secondary-broken-secondary.jpg',
        }),
      });
    });
  });
});
