export type ActionState = {
  success: boolean;
  error?: string;
  details?: unknown;
  data?: unknown;
};

export type TestSkuType = 'test' | 'fake' | 'edge_case';

export interface TestSku {
  id: string;
  config_id: string;
  sku: string;
  sku_type: TestSkuType;
  added_by: string | null;
  created_at: string;
}
