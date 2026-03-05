import { B2BClient, B2BConfig, B2BProduct, B2BInventoryUpdate, B2BPriceUpdate } from '../types';
import { parseFixedWidth, ORGILL_HD1_FIELDS } from '../utils/fixed-width';

interface OrgillHD1Record {
  recordType: string;
  distributorSku: string;
  upc: string;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  [key: string]: string | number;
}

export class OrgillClient implements B2BClient {
  private config: B2BConfig;

  constructor(config: B2BConfig) {
    this.config = config;
  }

  private async downloadFeed(): Promise<string | null> {
    if (!this.config.sftpHost || !this.config.username) {
      throw new Error('Orgill requires SFTP host and credentials');
    }

    const { B2BSFTPClient } = await import('../utils/sftp-client');
    const client = new B2BSFTPClient({
      host: this.config.sftpHost,
      port: this.config.sftpPort || 9401,
      username: this.config.username,
      password: this.config.password,
    });

    const remotePath = this.config.remotePath || '/feeds/HD1_Update.dat';
    const result = await client.downloadFile(remotePath);
    
    if (!result.success || !result.data) {
      console.error('[Orgill] Failed to download catalog:', result.error);
      return null;
    }

    return result.data;
  }

  private mapToB2BProduct(record: OrgillHD1Record): B2BProduct {
    return {
      source: 'ORGILL',
      distributorSku: record.distributorSku,
      upc: record.upc || undefined,
      name: record.name,
      price: record.price,
      cost: record.cost,
      quantity: record.quantity,
    };
  }

  async fetchCatalog(): Promise<B2BProduct[]> {
    const data = await this.downloadFeed();
    if (!data) return [];

    const records = parseFixedWidth<OrgillHD1Record>(
      data,
      ORGILL_HD1_FIELDS,
      { linePrefix: 'HD1' }
    );

    return records
      .filter(r => r.distributorSku && r.name)
      .map(r => this.mapToB2BProduct(r));
  }

  async fetchInventory(skus: string[]): Promise<B2BInventoryUpdate[]> {
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
        port: this.config.sftpPort || 9401,
        username: this.config.username,
        password: this.config.password,
      });
      return await client.testConnection();
    } catch {
      return false;
    }
  }
}
