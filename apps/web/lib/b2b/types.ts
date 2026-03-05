export interface B2BProduct {
  distributorSku: string;
  upc?: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price: number;
  cost: number;
  msrp?: number;
  quantity: number;
  weight?: number;
  images?: string[];
  attributes?: Record<string, string>;
  source: 'BCI' | 'ORGILL' | 'PHILLIPS' | 'CENTRAL' | 'PFX';
}

export interface B2BInventoryUpdate {
  distributorSku: string;
  quantity: number;
  nextAvailabilityDate?: string;
}

export interface B2BPriceUpdate {
  distributorSku: string;
  cost: number;
  msrp?: number;
  promoCost?: number;
  promoEnds?: string;
}

export interface B2BClient {
  /**
   * Fetch the full product catalog.
   * This is typically a heavy operation (EDI 832 or full API crawl).
   */
  fetchCatalog(): Promise<B2BProduct[]>;

  /**
   * Fetch real-time inventory for specific SKUs.
   * Use this for PDP checks or checkout validation.
   */
  fetchInventory(skus: string[]): Promise<B2BInventoryUpdate[]>;

  /**
   * Fetch real-time pricing.
   */
  fetchPricing(skus: string[]): Promise<B2BPriceUpdate[]>;

  /**
   * Check connection status.
   */
  healthCheck(): Promise<boolean>;
}

export type B2BConfig = {
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  sftpHost?: string;
  sftpPort?: number;
  remotePath?: string;
  environment?: 'production' | 'sandbox';
  van?: string;
  format?: string;
  transactions?: string[];
};

export type DistributorCode = 'BCI' | 'ORGILL' | 'PHILLIPS' | 'CENTRAL' | 'PFX';

export type FeedStatus = 'healthy' | 'degraded' | 'offline' | 'unconfigured';

export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type SyncJobType = 'catalog' | 'inventory' | 'pricing' | 'full';

export interface B2BFeed {
  id: string;
  distributor_code: DistributorCode;
  display_name: string;
  feed_type: 'REST' | 'SFTP' | 'EDI';
  status: FeedStatus;
  last_sync_at: string | null;
  last_sync_job_id: string | null;
  sync_frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  config: Record<string, unknown>;
  enabled: boolean;
  products_count: number;
  created_at: string;
  updated_at: string;
}

export interface B2BSyncJob {
  id: string;
  feed_id: string;
  job_type: SyncJobType;
  status: SyncJobStatus;
  products_fetched: number;
  products_created: number;
  products_updated: number;
  products_failed: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
}
