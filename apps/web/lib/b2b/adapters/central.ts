import { B2BClient, B2BConfig, B2BProduct } from '../types';

export class CentralClient implements B2BClient {
  private config: B2BConfig;

  constructor(config: B2BConfig) {
    this.config = config;
  }

  async fetchCatalog(): Promise<B2BProduct[]> {
    console.warn('[Central] EDI 832 parsing not implemented. Requires E2open onboarding or Stedi integration.');
    console.info('[Central] Config:', JSON.stringify({
      van: (this.config as { van?: string }).van,
      format: (this.config as { format?: string }).format,
    }));
    return [];
  }

  async healthCheck(): Promise<boolean> {
    console.warn('[Central] Health check requires EDI VAN connectivity.');
    return false;
  }
}
