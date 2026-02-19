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
        expect(result.error.type).toBe('invalid-json');
        expect(result.error.message).toBe('Invalid JSON payload');
    });

    it('rejects scraper callbacks missing required fields', () => {
        const result = parseScraperCallbackPayload(JSON.stringify({ status: 'running' }));
        expect(result.success).toBe(false);
        expect(result.error.type).toBe('schema');
        expect(result.error.message).toContain('job_id');
    });

    it('rejects completed scraper callbacks without results.data', () => {
        const payload = {
            job_id: 'job-123',
            status: 'completed',
        };
        const result = parseScraperCallbackPayload(JSON.stringify(payload));
        expect(result.success).toBe(false);
        expect(result.error.type).toBe('schema');
        expect(result.error.message).toBe('Completed callbacks must include results.data');
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
        expect(result.payload.job_id).toBe('job-123');
        expect(result.payload.results?.data?.['SKU-1']?.sourceA).toBeDefined();
    });
});

describe('chunk callback contract validation', () => {
    it('rejects invalid JSON payloads for chunk callbacks', () => {
        const result = parseChunkCallbackPayload('not-json');
        expect(result.success).toBe(false);
        expect(result.error.type).toBe('invalid-json');
        expect(result.error.message).toBe('Invalid JSON payload');
    });

    it('rejects chunk callbacks missing required chunk_id', () => {
        const result = parseChunkCallbackPayload(JSON.stringify({ status: 'completed' }));
        expect(result.success).toBe(false);
        expect(result.error.type).toBe('schema');
        expect(result.error.message).toContain('chunk_id');
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
        expect(result.payload.chunk_id).toBe('chunk-1');
    });
});
