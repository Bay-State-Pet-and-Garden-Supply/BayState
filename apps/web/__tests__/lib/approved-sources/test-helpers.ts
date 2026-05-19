/**
 * Test helpers for approved-sources tests.
 */

export interface MockDbQueryResponse {
  data?: any[] | null;
  error?: any | null;
}

/**
 * Create a mock Supabase client that supports the query chains used by
 * buildApprovedSourcePlans.
 *
 * Query chains:
 *   1. .from(...).select(...).in(...)                     → resolves
 *   2. .from(...).select(...).in(...)                     → resolves
 *   3. .from(...).select(...).in(...).eq(...).order(...)   → resolves
 */
export function createMockDbForSourcePlan(responses: MockDbQueryResponse[]) {
  let callIdx = 0;
  const next = () => {
    const r = responses[callIdx] ?? { data: [], error: null };
    callIdx++;
    return Promise.resolve(r);
  };

  const db: any = {
    from: jest.fn(() => db),
    select: jest.fn(() => db),
    in: jest.fn((field: string) => {
      if (field === 'brand_id') {
        // brand_sources query — chain continues to .eq() and .order()
        return db;
      }
      // products_ingestion or brands query — resolve immediately
      return next();
    }),
    eq: jest.fn(() => db),
    order: jest.fn(() => next()),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    insert: jest.fn(() => db),
    delete: jest.fn(() => db),
    update: jest.fn(() => db),
  };

  return db;
}
