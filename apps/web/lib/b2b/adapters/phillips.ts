import { B2BClient, B2BConfig, B2BProduct } from '../types';

interface PhillipsProductResponse {
  id: string;
  upc: string;
  gtin?: string;
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
  upc: string;
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
            distributorUpc: item.upc,
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
