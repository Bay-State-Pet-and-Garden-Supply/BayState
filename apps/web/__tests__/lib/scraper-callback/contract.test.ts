/**
 * @jest-environment node
 */
import {
    parseChunkCallbackPayload,
    parseScraperCallbackPayload,
} from '@/lib/scraper-callback/contract';

describe('scraper callback contract validation', () => {
    it('rejects invalid JSON payloads for scraper callbacks', () => {
        const result = parseScraperCallbackPayload('not-json');
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.type).toBe('invalid-json');
            expect(result.error.message).toBe('Invalid JSON payload');
        }
    });

    it('rejects scraper callbacks missing required fields', () => {
        const result = parseScraperCallbackPayload(JSON.stringify({ status: 'running' }));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.type).toBe('schema');
            expect(result.error.message).toContain('job_id');
        }
    });

    it('rejects completed scraper callbacks without results.data', () => {
        const payload = {
            job_id: 'job-123',
            status: 'completed',
        };
        const result = parseScraperCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.type).toBe('schema');
            expect(result.error.message).toBe('Completed callbacks must include results.data');
        }
    });

    it('accepts valid scraper callbacks with heterogeneous results', () => {
        const payload = {
            job_id: 'job-123',
            status: 'completed',
            results: {
                data: {
                    'SKU-1': {
                        sourceA: {
                            price: 12.99,
                            title: 'Fun toy',
                        },
                        sourceB: {
                            description: 'Second source data',
                        },
                    },
                },
            },
        };

        const result = parseScraperCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.payload.job_id).toBe('job-123');
            expect(result.payload.results?.data?.['SKU-1']?.sourceA).toBeDefined();
        }
    });

    it('accepts crawl4ai metadata on scraper callbacks', () => {
        const payload = {
            job_id: 'job-456',
            status: 'completed',
            results: {
                data: {
                    'SKU-2': {
                        sourceA: {
                            title: 'Crawl4AI Product',
                        },
                    },
                },
                extraction_strategy: ['css', 'llm'],
                cost_breakdown: {
                    total_usd: 0.17,
                },
                anti_bot_metrics: {
                    challenge_rate: 0.02,
                },
                crawl4ai: {
                    extraction_strategy: {
                        'SKU-2': 'llm',
                    },
                },
            },
        };

        const result = parseScraperCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.payload.results?.cost_breakdown).toBeDefined();
            expect(result.payload.results?.anti_bot_metrics).toBeDefined();
            expect(result.payload.results?.crawl4ai?.extraction_strategy).toBeDefined();
        }
    });
});

describe('chunk callback contract validation', () => {
    it('rejects invalid JSON payloads for chunk callbacks', () => {
        const result = parseChunkCallbackPayload('not-json');
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.type).toBe('invalid-json');
            expect(result.error.message).toBe('Invalid JSON payload');
        }
    });

    it('rejects chunk callbacks missing required chunk_id', () => {
        const result = parseChunkCallbackPayload(JSON.stringify({ status: 'completed' }));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.type).toBe('schema');
            expect(result.error.message).toContain('chunk_id');
        }
    });

    it('accepts valid chunk callbacks', () => {
        const payload = {
            chunk_id: 'chunk-1',
            status: 'completed',
            results: {
                skus_processed: 1,
                data: {
                    'SKU-1': {
                        title: 'chunked',
                    },
                },
            },
        };

        const result = parseChunkCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.payload.chunk_id).toBe('chunk-1');
        }
    });

    it('accepts chunk callbacks with logs and telemetry', () => {
        const payload = {
            chunk_id: 'chunk-telemetry',
            status: 'completed',
            results: {
                skus_processed: 1,
                skus_successful: 1,
                skus_failed: 0,
                data: {
                    '001135': {
                        bradley: {
                            Name: 'Test Product',
                        },
                    },
                },
                logs: [
                    {
                        level: 'info',
                        message: 'bradley/001135: Found data',
                    },
                ],
                telemetry: {
                    steps: [
                        {
                            step_index: 9,
                            action_type: 'extract',
                            status: 'completed',
                            extracted_data: {
                                Name: 'Test Product',
                            },
                        },
                    ],
                    selectors: [],
                    extractions: [],
                },
            },
        };

        const result = parseChunkCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.payload.results?.logs).toHaveLength(1);
            expect(result.payload.results?.telemetry?.steps).toHaveLength(1);
        }
    });
});
