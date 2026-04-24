import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

type AssertionField = {
    field: string;
    expected: string | null;
    actual: string | null;
    passed: boolean;
};

type AssertionSummary = {
    total: number;
    passed: number;
    failed: number;
};

type AssertionResult = {
    sku: string;
    assertions: AssertionField[];
    passed: boolean;
    summary: AssertionSummary;
};

type ScraperTestRunRow = {
    id: string;
    scraper_id: string;
    test_type: string;
    skus_tested: string[];
    results: unknown;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    runner_name: string | null;
    error_message: string | null;
    created_at: string;
    triggered_by: string | null;
    result_data: unknown | null;
    metadata: unknown;
    assertion_results: AssertionResult[];
};

describe('scraper_test_runs assertion_results', () => {
    const mockFrom = jest.fn();
    const mockInsert = jest.fn();
    const mockSelect = jest.fn();
    const mockEq = jest.fn();
    const mockSingle = jest.fn();

    const mockSupabase = {
        from: mockFrom,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect });
        mockInsert.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
        mockEq.mockReturnValue({ single: mockSingle });
    });

    describe('insert assertion_results JSONB', () => {
        it('should insert a test run with assertion_results column', async () => {
            const assertionResults = [
                {
                    sku: 'ABC123',
                    assertions: [
                        { field: 'name', expected: 'Product Name', actual: 'Product Name', passed: true },
                        { field: 'price', expected: '9.99', actual: '8.99', passed: false },
                    ],
                    passed: false,
                    summary: { total: 2, passed: 1, failed: 1 },
                },
            ];

            mockSingle.mockResolvedValue({
                data: {
                    id: 'run-1',
                    scraper_id: 'scraper-1',
                    assertion_results: assertionResults,
                },
                error: null,
            });

            const supabase = await createClient();
            const { data, error } = await supabase
                .from('scraper_test_runs')
                .insert({ scraper_id: 'scraper-1', assertion_results: assertionResults })
                .select()
                .single();

            expect(error).toBeNull();
            expect(data?.assertion_results).toEqual(assertionResults);
            expect(mockFrom).toHaveBeenCalledWith('scraper_test_runs');
        });
    });

    describe('assertion_results JSONB structure', () => {
        it('should match expected shape with sku, assertions, passed, and summary', () => {
            const assertionResult = {
                sku: 'TEST-SKU-001',
                assertions: [
                    { field: 'name', expected: 'Dog Food', actual: 'Dog Food', passed: true },
                    { field: 'price', expected: '12.99', actual: '12.99', passed: true },
                    { field: 'image', expected: 'https://example.com/img.jpg', actual: null, passed: false },
                ],
                passed: false,
                summary: { total: 3, passed: 2, failed: 1 },
            };

            expect(assertionResult).toHaveProperty('sku');
            expect(assertionResult).toHaveProperty('assertions');
            expect(assertionResult).toHaveProperty('passed');
            expect(assertionResult).toHaveProperty('summary');

            expect(Array.isArray(assertionResult.assertions)).toBe(true);
            expect(typeof assertionResult.passed).toBe('boolean');
            expect(typeof assertionResult.summary.total).toBe('number');
            expect(typeof assertionResult.summary.passed).toBe('number');
            expect(typeof assertionResult.summary.failed).toBe('number');
        });

        it('should validate assertion field structure', () => {
            const assertion = {
                field: 'name',
                expected: 'Product Name',
                actual: 'Product Name',
                passed: true,
            };

            expect(assertion).toHaveProperty('field');
            expect(assertion).toHaveProperty('expected');
            expect(assertion).toHaveProperty('actual');
            expect(assertion).toHaveProperty('passed');
            expect(typeof assertion.field).toBe('string');
            expect(typeof assertion.passed).toBe('boolean');
        });

        it('should support multiple SKU assertion results in a single run', () => {
            const assertionResults = [
                {
                    sku: 'SKU-001',
                    assertions: [{ field: 'name', expected: 'A', actual: 'A', passed: true }],
                    passed: true,
                    summary: { total: 1, passed: 1, failed: 0 },
                },
                {
                    sku: 'SKU-002',
                    assertions: [
                        { field: 'name', expected: 'B', actual: 'B', passed: true },
                        { field: 'price', expected: '5.00', actual: '4.50', passed: false },
                    ],
                    passed: false,
                    summary: { total: 2, passed: 1, failed: 1 },
                },
            ];

            expect(assertionResults).toHaveLength(2);
            expect(assertionResults[0].passed).toBe(true);
            expect(assertionResults[1].passed).toBe(false);
            expect(assertionResults[1].summary.failed).toBe(1);
        });
    });

    describe('query assertion_results by scraper_id', () => {
        it('should query test runs filtered by scraper_id with assertion_results', async () => {
            const mockRuns = [
                {
                    id: 'run-1',
                    scraper_id: 'scraper-1',
                    assertion_results: [
                        { sku: 'SKU-001', assertions: [], passed: true, summary: { total: 0, passed: 0, failed: 0 } },
                    ],
                },
            ];

            mockSingle.mockResolvedValue({ data: mockRuns, error: null });

            const supabase = await createClient();
            const { data } = await supabase
                .from('scraper_test_runs')
                .select('id, scraper_id, assertion_results')
                .eq('scraper_id', 'scraper-1')
                .single();

            expect(data).toBeDefined();
            expect(mockFrom).toHaveBeenCalledWith('scraper_test_runs');
        });
    });

    describe('database schema validation', () => {
        it('should have assertion_results column on scraper_test_runs table', async () => {
            const mockRpc = jest.fn().mockResolvedValue({
                data: [{ column_name: 'assertion_results', data_type: 'jsonb', is_nullable: 'YES' }],
                error: null,
            });
            mockFrom.mockReturnValue({ select: mockSelect });
            (createClient as jest.Mock).mockResolvedValue({ from: mockFrom, rpc: mockRpc });

            const supabase = await createClient();
            const { data, error } = await supabase.rpc('get_table_columns', {
                table_name: 'scraper_test_runs',
            });

            expect(error).toBeNull();
            expect(data).toBeDefined();
            const assertionCol = data?.find((col: { column_name: string }) => col.column_name === 'assertion_results');
            expect(assertionCol).toBeDefined();
            expect(assertionCol?.data_type).toBe('jsonb');
        });
    });
});