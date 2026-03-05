import { B2BClient, B2BConfig, B2BProduct, B2BInventoryUpdate, B2BPriceUpdate } from '../types';

interface PhillipsProductResponse {
  id: string;
  sku: string;
  upc?: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  price: number;
  cost: number;
  msrp?: number;
  quantity: number;
  weight?: number;
  images?: string[];
}

interface PhillipsInventoryResponse {
  sku: string;
  quantity: number;
  nextAvailable?: string;
}

export class PhillipsClient implements B2BClient {
  private config: B2BConfig;
  private baseUrl: string;

  constructor(config: B2BConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.endlessaisles.io/v1';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
    };
  }

  async fetchCatalog(): Promise<B2BProduct[]> {
    const products: B2BProduct[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await fetch(
          `${this.baseUrl}/products?page=${page}&pageSize=${pageSize}`,
          { headers: this.getHeaders() }
        );

        if (!response.ok) {
          console.error('[Phillips] Catalog request failed:', response.status);
          break;
        }

        const data = await response.json();
        const items: PhillipsProductResponse[] = data.items || data.products || [];

        for (const item of items) {
          products.push({
            source: 'PHILLIPS',
            distributorSku: item.sku,
            upc: item.upc,
            name: item.name,
            description: item.description,
            brand: item.brand,
            category: item.category,
            price: item.price,
            cost: item.cost,
            msrp: item.msrp,
            quantity: item.quantity,
            weight: item.weight,
            images: item.images,
          });
        }

        hasMore = items.length === pageSize;
        page++;
      } catch (error) {
        console.error('[Phillips] Catalog fetch error:', error);
        break;
      }
    }

    return products;
  }

  async fetchInventory(skus: string[]): Promise<B2BInventoryUpdate[]> {
    if (skus.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/inventory/check`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ skus }),
      });

      if (!response.ok) {
        console.error('[Phillips] Inventory request failed:', response.status);
        return skus.map(sku => ({ distributorSku: sku, quantity: 0 }));
      }

      const data = await response.json();
      const items: PhillipsInventoryResponse[] = data.items || [];

      return items.map(item => ({
        distributorSku: item.sku,
        quantity: item.quantity,
        nextAvailabilityDate: item.nextAvailable,
      }));
    } catch (error) {
      console.error('[Phillips] Inventory fetch error:', error);
      return skus.map(sku => ({ distributorSku: sku, quantity: 0 }));
    }
  }

  async fetchPricing(skus: string[]): Promise<B2BPriceUpdate[]> {
    if (skus.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/pricing`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ skus }),
      });

      if (!response.ok) {
        console.error('[Phillips] Pricing request failed:', response.status);
        return skus.map(sku => ({ distributorSku: sku, cost: 0 }));
      }

      const data = await response.json();
      return (data.items || []).map((item: { sku: string; cost: number; msrp?: number }) => ({
        distributorSku: item.sku,
        cost: item.cost,
        msrp: item.msrp,
      }));
    } catch (error) {
      console.error('[Phillips] Pricing fetch error:', error);
      return skus.map(sku => ({ distributorSku: sku, cost: 0 }));
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
