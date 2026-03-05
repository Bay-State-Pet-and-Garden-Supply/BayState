import { B2BClient, B2BConfig, B2BProduct, B2BInventoryUpdate, B2BPriceUpdate } from '../types';
import { parseCSV, mapCSVToType } from '../utils/csv-parser';

interface PFXProductRecord {
  distributorSku: string;
  upc: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  cost: number;
  quantity: number;
  weight: number;
}

const PFX_FIELD_MAPPING = {
  distributorSku: 'Item #',
  upc: 'UPC',
  name: 'Description',
  brand: 'Brand',
  category: 'Category',
  price: (row: Record<string, string>) => parseFloat(row['Retail Price'] || '0'),
  cost: (row: Record<string, string>) => parseFloat(row['Net Cost'] || '0'),
  quantity: (row: Record<string, string>) => parseInt(row['Qty Avail'] || '0', 10),
  weight: (row: Record<string, string>) => parseFloat(row['Weight'] || '0'),
};

export class PFXClient implements B2BClient {
  private config: B2BConfig;

  constructor(config: B2BConfig) {
    this.config = config;
  }

  private async downloadFeed(): Promise<string | null> {
    if (!this.config.sftpHost || !this.config.username) {
      throw new Error('PFX requires SFTP host and credentials');
    }

    const { B2BSFTPClient } = await import('../utils/sftp-client');
    const client = new B2BSFTPClient({
      host: this.config.sftpHost,
      port: this.config.sftpPort || 22,
      username: this.config.username,
      password: this.config.password,
    });

    const remotePath = this.config.remotePath || '/exports/inventory.csv';
    const result = await client.downloadFile(remotePath);
    
    if (!result.success || !result.data) {
      console.error('[PFX] Failed to download catalog:', result.error);
      return null;
    }

    return result.data;
  }

  async fetchCatalog(): Promise<B2BProduct[]> {
    const data = await this.downloadFeed();
    if (!data) return [];

    const parseResult = parseCSV(data, { hasHeaders: true });
    
    if (!parseResult.success) {
      console.error('[PFX] CSV parse errors:', parseResult.errors);
    }

    const records = mapCSVToType<PFXProductRecord>(parseResult.data, PFX_FIELD_MAPPING);

    return records
      .filter(r => r.distributorSku && r.name)
      .map(r => ({
        source: 'PFX' as const,
        distributorSku: r.distributorSku,
        upc: r.upc || undefined,
        name: r.name,
        brand: r.brand || undefined,
        category: r.category || undefined,
        price: r.price,
        cost: r.cost,
        quantity: r.quantity,
        weight: r.weight || undefined,
      }));
  }

  async fetchInventory(skus: string[]): Promise<B2BInventoryUpdate[]> {
    console.warn('[PFX] SFTP is batch-only. Returning data from last catalog sync.');
    const catalog = await this.fetchCatalog();
    const skuSet = new Set(skus);
    
    return catalog
      .filter(p => skuSet.has(p.distributorSku))
      .map(p => ({
        distributorSku: p.distributorSku,
        quantity: p.quantity,
      }));
  }

  async fetchPricing(skus: string[]): Promise<B2BPriceUpdate[]> {
    const catalog = await this.fetchCatalog();
    const skuSet = new Set(skus);
    
    return catalog
      .filter(p => skuSet.has(p.distributorSku))
      .map(p => ({
        distributorSku: p.distributorSku,
        cost: p.cost,
        msrp: p.price,
      }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.config.sftpHost || !this.config.username) {
        return false;
      }
      const { B2BSFTPClient } = await import('../utils/sftp-client');
      const client = new B2BSFTPClient({
        host: this.config.sftpHost,
        port: this.config.sftpPort || 22,
        username: this.config.username,
        password: this.config.password,
      });
      return await client.testConnection();
    } catch {
      return false;
    }
  }
}
