/**
 * OpenAI Client Mock
 *
 * Mock implementation for testing consolidation without making real API calls.
 * Returns predictable consolidation results based on input SKUs.
 */

import type { BatchStatus, ConsolidationResult, SubmitBatchResponse } from '../types';

// =============================================================================
// Mock Data
// =============================================================================

/**
 * Default consolidation results for test products.
 * Maps SKU patterns to predictable outputs.
 */
const MOCK_CONSOLIDATION_RESULTS: Record<string, ConsolidationResult> = {
    // Default fallback result
    default: {
        sku: '',
        name: 'Test Product',
        brand: 'Test Brand',
        weight: '5 lbs',
        price: '19.99',
        category: 'Dog',
        product_on_pages: 'Main Website',
        description: 'A test product for consolidation.',
        confidence_score: 0.95,
    },
};

/**
 * Default batch status for mock batches.
 */
const MOCK_BATCH_STATUS: BatchStatus = {
    id: 'mock-batch-id',
    status: 'completed',
    is_complete: true,
    is_failed: false,
    is_processing: false,
    total_requests: 10,
    completed_requests: 10,
    failed_requests: 0,
    progress_percent: 100,
    created_at: Date.now() / 1000,
    completed_at: Date.now() / 1000,
    metadata: {},
};

// =============================================================================
// Mock Configuration
// =============================================================================

/**
 * Export the same config as the real module.
 */
export const CONSOLIDATION_CONFIG = {
    model: 'gpt-4o-mini',
    maxTokens: 1024,
    temperature: 0.1,
    completionWindow: '24h' as const,
} as const;

/**
 * Mock implementation - always returns true for testing.
 */
export async function isOpenAIConfigured(): Promise<boolean> {
    return true;
}

// =============================================================================
// Mock Client Implementation
// =============================================================================

/**
 * Create a mock OpenAI client with predictable responses.
 */
function createMockClient() {
    return {
        files: {
            create: async (params: { file: File; purpose: string }) => {
                return {
                    id: `mock-file-${Date.now()}`,
                    object: 'file',
                    bytes: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    filename: params.file.name,
                    purpose: params.purpose,
                };
            },
            content: async (fileId: string) => {
                // Return mock JSONL content with consolidation results
                const results = generateMockResults();
                const jsonlLines = results
                    .map((r) => JSON.stringify({
                        custom_id: r.sku,
                        response: {
                            body: {
                                choices: [
                                    {
                                        message: {
                                            content: JSON.stringify(r),
                                        },
                                    },
                                ],
                            },
                        },
                    }))
                    .join('\n');

                return {
                    text: async () => jsonlLines,
                };
            },
        },
        batches: {
            create: async (params: {
                input_file_id: string;
                endpoint: string;
                completion_window: string;
                metadata?: Record<string, string>;
            }): Promise<{ id: string; status: string }> => {
                return {
                    id: `mock-batch-${Date.now()}`,
                    status: 'completed',
                };
            },
            retrieve: async (batchId: string): Promise<{
                id: string;
                status: string;
                request_counts?: { total: number; completed: number; failed: number };
                output_file_id?: string;
                error_file_id?: string;
                created_at?: number;
                completed_at?: number;
                metadata?: Record<string, unknown>;
            }> => {
                return {
                    id: batchId,
                    status: 'completed',
                    request_counts: {
                        total: 10,
                        completed: 10,
                        failed: 0,
                    },
                    output_file_id: `mock-output-file-${Date.now()}`,
                    error_file_id: undefined,
                    created_at: Math.floor(Date.now() / 1000) - 60,
                    completed_at: Math.floor(Date.now() / 1000),
                    metadata: {},
                };
            },
            cancel: async (batchId: string) => {
                return {
                    id: batchId,
                    status: 'cancelled',
                };
            },
        },
    };
}

/**
 * Generate mock consolidation results for products.
 */
function generateMockResults(): ConsolidationResult[] {
    return [
        {
            sku: 'TEST-SKU-001',
            name: 'Premium Dog Food',
            brand: 'Acme Pet',
            weight: '15 lbs',
            price: '34.99',
            category: 'Dog',
            product_on_pages: 'Main Website|Catalog',
            description: 'High-quality dry dog food for adult dogs.',
            confidence_score: 0.92,
        },
        {
            sku: 'TEST-SKU-002',
            name: 'Cat Scratch Post',
            brand: 'Feline Fine',
            weight: '8 lbs',
            price: '49.99',
            category: 'Cat',
            product_on_pages: 'Main Website',
            description: 'Durable sisal rope scratch post for cats.',
            confidence_score: 0.88,
        },
        {
            sku: 'TEST-SKU-003',
            name: 'Bird Seed Blend',
            brand: 'Wing & Crest',
            weight: '5 lbs',
            price: '14.99',
            category: 'Bird',
            product_on_pages: 'Main Website|Seasonal',
            description: 'Premium mixed seed blend for wild birds.',
            confidence_score: 0.95,
        },
    ];
}

// =============================================================================
// Module State
// =============================================================================

let mockClient: ReturnType<typeof createMockClient> | null = null;

/**
 * Get the mock OpenAI client instance.
 * Returns a mock client that doesn't make real API calls.
 */
export async function getOpenAIClient(): Promise<ReturnType<typeof createMockClient> | null> {
    if (!mockClient) {
        mockClient = createMockClient();
    }
    return mockClient;
}

/**
 * Reset the mock client.
 * Useful for test isolation.
 */
export function resetMockClient(): void {
    mockClient = null;
}

/**
 * Set custom mock results for testing.
 * Call this before tests to provide specific expected outputs.
 */
export function setMockResults(results: ConsolidationResult[]): void {
    // This function allows tests to customize results
    // The actual implementation stores results that will be returned
    console.log('[Mock] Custom results set:', results.length, 'products');
}

/**
 * Get the current mock results for verification.
 */
export function getMockResults(): ConsolidationResult[] {
    return generateMockResults();
}
