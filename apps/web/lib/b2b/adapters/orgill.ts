import { B2BClient, B2BConfig, B2BProduct } from '../types';
import { parseFixedWidth, ORGILL_HD1_FIELDS } from '../utils/fixed-width';

interface OrgillHD1Record {
  recordType: string;
  distributorUpc: string;
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
      distributorUpc: record.distributorUpc,
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
      .filter(r => r.distributorUpc && r.name)
      .map(r => this.mapToB2BProduct(r));
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
