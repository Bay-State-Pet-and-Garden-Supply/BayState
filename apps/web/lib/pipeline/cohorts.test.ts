/**
 * @jest-environment node
 */

import { recohortProducts } from './cohorts';

describe('recohortProducts status transition logic', () => {
  let mockSupabase: any;
  let updateCalls: any[] = [];

  beforeEach(() => {
    updateCalls = [];
  });

  const createSupabaseMock = (mockProduct: any) => {
    return {
      from: jest.fn((table: string) => {
        const chain: any = {};
        chain.select = jest.fn(() => chain);
        chain.in = jest.fn(() => chain);
        chain.eq = jest.fn(() => chain);
        chain.is = jest.fn(() => chain);
        chain.maybeSingle = jest.fn(() => chain);
        chain.update = jest.fn((val: any) => {
          updateCalls.push(val);
          return chain;
        });
        chain.upsert = jest.fn(() => chain);
        chain.delete = jest.fn(() => chain);
        
        chain.then = (onfulfilled: any) => {
          let resolvedValue: any = null;
          if (table === 'products_ingestion') {
            resolvedValue = { data: [mockProduct], error: null };
          } else if (table === 'cohort_batches') {
            resolvedValue = { data: { id: 'cohort-new' }, error: null };
          } else if (table === 'cohort_members') {
            resolvedValue = { count: 0, error: null };
          }
          return Promise.resolve(resolvedValue).then(onfulfilled);
        };
        
        return chain;
      })
    };
  };

  it('resets pipeline_status to imported when brand is changed on an imported product', async () => {
    const mockProduct = {
      upc: '123456789012',
      cohort_id: 'old-cohort',
      brand_id: 'brand-old',
      consolidated: { brand_id: 'brand-old' },
      pipeline_status: 'imported'
    };

    mockSupabase = createSupabaseMock(mockProduct);

    await recohortProducts(mockSupabase, ['123456789012'], 'brand-new');

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].pipeline_status).toBe('imported');
    expect(updateCalls[0].brand_id).toBe('brand-new');
  });

  it('preserves reviewing pipeline_status when brand is changed on a reviewing product', async () => {
    const mockProduct = {
      upc: '123456789012',
      cohort_id: 'old-cohort',
      brand_id: 'brand-old',
      consolidated: { brand_id: 'brand-old' },
      pipeline_status: 'reviewing'
    };

    mockSupabase = createSupabaseMock(mockProduct);

    await recohortProducts(mockSupabase, ['123456789012'], 'brand-new');

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].pipeline_status).toBeUndefined(); // remains unchanged
    expect(updateCalls[0].brand_id).toBe('brand-new');
  });

  it('preserves publishing pipeline_status when brand is changed on a publishing product', async () => {
    const mockProduct = {
      upc: '123456789012',
      cohort_id: 'old-cohort',
      brand_id: 'brand-old',
      consolidated: { brand_id: 'brand-old' },
      pipeline_status: 'publishing'
    };

    mockSupabase = createSupabaseMock(mockProduct);

    await recohortProducts(mockSupabase, ['123456789012'], 'brand-new');

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].pipeline_status).toBeUndefined(); // remains unchanged
    expect(updateCalls[0].brand_id).toBe('brand-new');
  });
});
