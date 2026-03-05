import { B2BClient, B2BConfig, B2BProduct, B2BInventoryUpdate, B2BPriceUpdate } from '../types';
import { OAuthClient, createOrderCloudClient } from '../utils/oauth';

interface OrderCloudProduct {
  ID: string;
  Name: string;
  Description?: string;
  xp?: {
    UPC?: string;
    Brand?: string;
    Category?: string;
    Weight?: number;
    Images?: string[];
  };
}

interface OrderCloudPriceSchedule {
  ID: string;
  PriceBreaks: Array<{
    Quantity: number;
    Price: number;
  }>;
}

interface OrderCloudInventory {
  ProductID: string;
  QuantityAvailable: number;
}

export class BCIClient implements B2BClient {
  private config: B2BConfig;
  private oauth: OAuthClient | null = null;
  private baseUrl: string;

  constructor(config: B2BConfig) {
    this.config = config;
    const environment = (config as { environment?: string }).environment;
    this.baseUrl = environment === 'sandbox'
      ? 'https://sandboxapi.ordercloud.io/v1'
      : 'https://api.ordercloud.io/v1';
  }

  private getOAuthClient(): OAuthClient {
    if (!this.oauth) {
      if (!this.config.apiKey || !this.config.apiSecret) {
        throw new Error('BCI requires OrderCloud client credentials');
      }
      const environment = (this.config as { environment?: string }).environment;
      this.oauth = createOrderCloudClient(
        this.config.apiKey,
        this.config.apiSecret,
        environment === 'sandbox' ? 'sandbox' : 'production'
      );
    }
    return this.oauth;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const auth = await this.getOAuthClient().getAuthorizationHeader();
    if (!auth) {
      throw new Error('Failed to obtain BCI access token');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': auth,
    };
  }

  async fetchCatalog(): Promise<B2BProduct[]> {
    const products: B2BProduct[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    const headers = await this.getHeaders();

    while (hasMore) {
      try {
        const response = await fetch(
          `${this.baseUrl}/me/products?page=${page}&pageSize=${pageSize}`,
          { headers }
        );

        if (!response.ok) {
          console.error('[BCI] Product request failed:', response.status);
          break;
        }

        const data = await response.json();
        const items: OrderCloudProduct[] = data.Items || [];

        for (const item of items) {
          const priceSchedule = await this.fetchPriceSchedule(item.ID, headers);
          const price = priceSchedule?.PriceBreaks?.[0]?.Price || 0;

          products.push({
            source: 'BCI',
            distributorSku: item.ID,
            upc: item.xp?.UPC,
            name: item.Name,
            description: item.Description,
            brand: item.xp?.Brand,
            category: item.xp?.Category,
            price: price,
            cost: price,
            quantity: 0,
            weight: item.xp?.Weight,
            images: item.xp?.Images,
          });
        }

        hasMore = items.length === pageSize;
        page++;
      } catch (error) {
        console.error('[BCI] Catalog fetch error:', error);
        break;
      }
    }

    return products;
  }

  private async fetchPriceSchedule(
    productId: string,
    headers: HeadersInit
  ): Promise<OrderCloudPriceSchedule | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/me/products/${productId}/priceschedules`,
        { headers }
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.Items?.[0] || null;
    } catch {
      return null;
    }
  }

  async fetchInventory(skus: string[]): Promise<B2BInventoryUpdate[]> {
    if (skus.length === 0) return [];
    
    const headers = await this.getHeaders();
    const updates: B2BInventoryUpdate[] = [];

    for (const sku of skus) {
      try {
        const response = await fetch(
          `${this.baseUrl}/me/products/${sku}/inventory`,
          { headers }
        );
        
        if (response.ok) {
          const data: OrderCloudInventory = await response.json();
          updates.push({
            distributorSku: sku,
            quantity: data.QuantityAvailable || 0,
          });
        } else {
          updates.push({ distributorSku: sku, quantity: 0 });
        }
      } catch {
        updates.push({ distributorSku: sku, quantity: 0 });
      }
    }

    return updates;
  }

  async fetchPricing(skus: string[]): Promise<B2BPriceUpdate[]> {
    if (skus.length === 0) return [];
    
    const headers = await this.getHeaders();
    const updates: B2BPriceUpdate[] = [];

    for (const sku of skus) {
      const priceSchedule = await this.fetchPriceSchedule(sku, headers);
      const cost = priceSchedule?.PriceBreaks?.[0]?.Price || 0;
      updates.push({ distributorSku: sku, cost });
    }

    return updates;
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.getOAuthClient().testConnection();
    } catch {
      return false;
    }
  }
}
