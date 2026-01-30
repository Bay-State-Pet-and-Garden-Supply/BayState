import {
    ConsolidationResultSchema,
    PipelineStatusSchema,
    PipelineProductSchema,
    BatchJobSchema,
    ProductSourceSchema,
    ConsolidatedDataSchema,
    CategorySchema,
    ConsolidationSubmitSchema,
    ScrapeCallbackPayloadSchema,
    BatchMetadataSchema,
    BatchJobStatusSchema,
    SubmitBatchResponseSchema,
} from '@/lib/validation';

describe('Consolidation Schemas', () => {
    describe('ConsolidationResultSchema', () => {
        const validConsolidationResult = {
            sku: 'TEST-SKU-123',
            name: 'Premium Dog Food',
            brand: 'Acme Pet',
            weight: '5 lb',
            price: '29.99',
            category: 'Dog Food',
            product_type: 'Dry Food',
            product_on_pages: 'dog-food',
            description: 'High quality dog food for all breeds',
            confidence_score: 0.95,
        };

        it('should parse valid consolidation result', () => {
            const result = ConsolidationResultSchema.parse(validConsolidationResult);
            expect(result.sku).toBe('TEST-SKU-123');
            expect(result.name).toBe('Premium Dog Food');
            expect(result.confidence_score).toBe(0.95);
        });

        it('should parse consolidation result with minimal fields', () => {
            const minimalResult = { sku: 'MINIMAL-SKU' };
            const result = ConsolidationResultSchema.parse(minimalResult);
            expect(result.sku).toBe('MINIMAL-SKU');
            expect(result.name).toBeUndefined();
        });

        it('should reject consolidation result with empty SKU', () => {
            const invalidResult = { sku: '' };
            expect(() => ConsolidationResultSchema.parse(invalidResult)).toThrow();
        });

        it('should reject consolidation result with invalid confidence score', () => {
            const invalidResult = {
                ...validConsolidationResult,
                confidence_score: 1.5,
            };
            expect(() => ConsolidationResultSchema.parse(invalidResult)).toThrow();
        });

        it('should reject consolidation result with missing SKU', () => {
            const invalidResult = { name: 'No SKU Product' };
            expect(() => ConsolidationResultSchema.parse(invalidResult)).toThrow();
        });

        it('should reject consolidation result with non-string SKU', () => {
            const invalidResult = { sku: 12345 };
            expect(() => ConsolidationResultSchema.parse(invalidResult)).toThrow();
        });

        it('should accept consolidation result with error field', () => {
            const resultWithError = {
                sku: 'ERROR-SKU',
                error: 'Failed to consolidate product data',
            };
            const result = ConsolidationResultSchema.parse(resultWithError);
            expect(result.sku).toBe('ERROR-SKU');
            expect(result.error).toBe('Failed to consolidate product data');
        });
    });

    describe('PipelineStatusSchema', () => {
        it('should accept valid pipeline statuses', () => {
            const validStatuses = ['staging', 'scraped', 'consolidated', 'approved', 'published'];
            for (const status of validStatuses) {
                expect(PipelineStatusSchema.parse(status)).toBe(status);
            }
        });

        it('should reject invalid pipeline status', () => {
            expect(() => PipelineStatusSchema.parse('invalid_status')).toThrow();
        });

        it('should reject non-string status', () => {
            expect(() => PipelineStatusSchema.parse(123)).toThrow();
        });
    });

    describe('PipelineProductSchema', () => {
        const validPipelineProduct = {
            sku: 'PROD-001',
            input: {
                name: 'Original Product',
                price: 19.99,
            },
            sources: {
                'scraper-a': { price: 19.99, title: 'Product A' },
                'scraper-b': { price: 18.99, title: 'Product B' },
            },
            consolidated: {
                name: 'Consolidated Product',
                description: 'Normalized product data',
                price: 19.49,
                images: ['https://example.com/image1.jpg'],
                brand_id: 'brand-123',
                stock_status: 'in_stock',
                is_featured: false,
            },
            pipeline_status: 'scraped',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
        };

        it('should parse valid pipeline product', () => {
            const result = PipelineProductSchema.parse(validPipelineProduct);
            expect(result.sku).toBe('PROD-001');
            expect(result.pipeline_status).toBe('scraped');
        });

        it('should parse pipeline product with optional fields missing', () => {
            const minimalProduct = {
                sku: 'MIN-001',
                input: {},
                sources: {},
                consolidated: {},
                pipeline_status: 'staging',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };
            const result = PipelineProductSchema.parse(minimalProduct);
            expect(result.sku).toBe('MIN-001');
        });

        it('should reject pipeline product with empty SKU', () => {
            const invalidProduct = { ...validPipelineProduct, sku: '' };
            expect(() => PipelineProductSchema.parse(invalidProduct)).toThrow();
        });

        it('should reject pipeline product with invalid status', () => {
            const invalidProduct = { ...validPipelineProduct, pipeline_status: 'invalid' };
            expect(() => PipelineProductSchema.parse(invalidProduct)).toThrow();
        });

        it('should reject pipeline product with invalid images array', () => {
            const invalidProduct = {
                ...validPipelineProduct,
                consolidated: {
                    ...validPipelineProduct.consolidated,
                    images: ['not-a-url'],
                },
            };
            expect(() => PipelineProductSchema.parse(invalidProduct)).toThrow();
        });
    });

    describe('BatchJobSchema', () => {
        const validBatchJob = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'completed',
            description: 'Test batch job',
            auto_apply: false,
            total_requests: 100,
            completed_requests: 100,
            failed_requests: 0,
            prompt_tokens: 5000,
            completion_tokens: 2500,
            total_tokens: 7500,
            estimated_cost: 0.15,
            retry_count: 0,
            max_retries: 3,
            failed_skus: null,
            parent_batch_id: null,
            input_file_id: 'file-123',
            output_file_id: 'file-456',
            error_file_id: null,
            metadata: { description: 'Test batch' },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T01:00:00Z',
            completed_at: '2024-01-01T01:00:00Z',
            webhook_received_at: null,
            webhook_payload: null,
        };

        it('should parse valid batch job', () => {
            const result = BatchJobSchema.parse(validBatchJob);
            expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
            expect(result.total_requests).toBe(100);
        });

        it('should reject batch job with invalid UUID', () => {
            const invalidJob = { ...validBatchJob, id: 'not-a-uuid' };
            expect(() => BatchJobSchema.parse(invalidJob)).toThrow();
        });

        it('should reject batch job with negative values', () => {
            const invalidJob = { ...validBatchJob, total_requests: -1 };
            expect(() => BatchJobSchema.parse(invalidJob)).toThrow();
        });
    });

    describe('ProductSourceSchema', () => {
        const validProductSource = {
            sku: 'SOURCE-001',
            sources: {
                'scraper-1': { price: 10.99, title: 'Product 1' },
                'scraper-2': { price: 11.99, title: 'Product 2' },
            },
        };

        it('should parse valid product source', () => {
            const result = ProductSourceSchema.parse(validProductSource);
            expect(result.sku).toBe('SOURCE-001');
        });

        it('should reject product source with empty sources object', () => {
            const invalidSource = { sku: 'SOURCE-002', sources: {} };
            const result = ProductSourceSchema.parse(invalidSource);
            expect(result.sources).toEqual({});
        });
    });

    describe('ConsolidatedDataSchema', () => {
        const validConsolidatedData = {
            name: 'Consolidated Product',
            description: 'A great product',
            price: 29.99,
            images: [
                'https://example.com/image1.jpg',
                'https://example.com/image2.jpg',
            ],
            brand_id: 'brand-123',
            stock_status: 'in_stock',
            is_featured: true,
            category: 'Electronics',
            product_type: 'Gadgets',
            weight: '1.5 lb',
            confidence_score: 0.92,
        };

        it('should parse valid consolidated data', () => {
            const result = ConsolidatedDataSchema.parse(validConsolidatedData);
            expect(result.name).toBe('Consolidated Product');
            expect(result.price).toBe(29.99);
            expect(result.images).toHaveLength(2);
        });

        it('should parse consolidated data with minimal fields', () => {
            const minimalData = { name: 'Minimal Product' };
            const result = ConsolidatedDataSchema.parse(minimalData);
            expect(result.name).toBe('Minimal Product');
        });

        it('should reject consolidated data with negative price', () => {
            const invalidData = { ...validConsolidatedData, price: -10 };
            expect(() => ConsolidatedDataSchema.parse(invalidData)).toThrow();
        });

        it('should reject consolidated data with invalid confidence score', () => {
            const invalidData = { ...validConsolidatedData, confidence_score: 1.1 };
            expect(() => ConsolidatedDataSchema.parse(invalidData)).toThrow();
        });

        it('should reject consolidated data with non-array images', () => {
            const invalidData = { ...validConsolidatedData, images: 'not-an-array' };
            expect(() => ConsolidatedDataSchema.parse(invalidData)).toThrow();
        });
    });

    describe('CategorySchema', () => {
        const validCategory = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Dog Food',
            slug: 'dog-food',
        };

        it('should parse valid category', () => {
            const result = CategorySchema.parse(validCategory);
            expect(result.name).toBe('Dog Food');
            expect(result.slug).toBe('dog-food');
        });

        it('should parse category with null slug', () => {
            const categoryWithoutSlug = { ...validCategory, slug: null };
            const result = CategorySchema.parse(categoryWithoutSlug);
            expect(result.slug).toBeNull();
        });

        it('should reject category with empty name', () => {
            const invalidCategory = { ...validCategory, name: '' };
            expect(() => CategorySchema.parse(invalidCategory)).toThrow();
        });
    });

    describe('ConsolidationSubmitSchema', () => {
        const validSubmitRequest = {
            skus: ['SKU-001', 'SKU-002', 'SKU-003'],
            description: 'Submit for consolidation',
            auto_apply: true,
        };

        it('should parse valid submit request', () => {
            const result = ConsolidationSubmitSchema.parse(validSubmitRequest);
            expect(result.skus).toHaveLength(3);
            expect(result.auto_apply).toBe(true);
        });

        it('should parse submit request with minimal fields', () => {
            const minimalSubmit = { skus: ['SKU-001'] };
            const result = ConsolidationSubmitSchema.parse(minimalSubmit);
            expect(result.skus).toHaveLength(1);
        });

        it('should reject submit request with empty SKUs array', () => {
            const invalidSubmit = { skus: [] };
            expect(() => ConsolidationSubmitSchema.parse(invalidSubmit)).toThrow();
        });

        it('should reject submit request with non-array SKUs', () => {
            const invalidSubmit = { skus: 'SKU-001' };
            expect(() => ConsolidationSubmitSchema.parse(invalidSubmit)).toThrow();
        });

        it('should reject submit request with empty SKU in array', () => {
            const invalidSubmit = { skus: ['SKU-001', ''] };
            expect(() => ConsolidationSubmitSchema.parse(invalidSubmit)).toThrow();
        });
    });

    describe('ScrapeCallbackPayloadSchema', () => {
        const validCallbackPayload = {
            job_id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'completed',
            runner_name: 'runner-01',
            error_message: undefined,
            results: {
                skus_processed: 50,
                scrapers_run: ['scraper-a', 'scraper-b'],
                data: {
                    'SKU-001': {
                        'scraper-a': { price: 19.99, title: 'Product 1' },
                        'scraper-b': { price: 18.99, title: 'Product 1b' },
                    },
                },
            },
        };

        it('should parse valid callback payload', () => {
            const result = ScrapeCallbackPayloadSchema.parse(validCallbackPayload);
            expect(result.job_id).toBe('550e8400-e29b-41d4-a716-446655440000');
            expect(result.status).toBe('completed');
        });

        it('should parse callback payload with failed status', () => {
            const failedPayload = {
                ...validCallbackPayload,
                status: 'failed',
                error_message: 'Scraping failed due to network error',
            };
            const result = ScrapeCallbackPayloadSchema.parse(failedPayload);
            expect(result.status).toBe('failed');
        });

        it('should parse callback payload with running status', () => {
            const runningPayload = {
                job_id: '550e8400-e29b-41d4-a716-446655440000',
                status: 'running',
            };
            const result = ScrapeCallbackPayloadSchema.parse(runningPayload);
            expect(result.status).toBe('running');
        });

        it('should reject callback payload with missing job_id', () => {
            const invalidPayload = { status: 'completed' };
            expect(() => ScrapeCallbackPayloadSchema.parse(invalidPayload)).toThrow();
        });

        it('should reject callback payload with invalid status', () => {
            const invalidPayload = {
                job_id: '550e8400-e29b-41d4-a716-446655440000',
                status: 'invalid_status',
            };
            expect(() => ScrapeCallbackPayloadSchema.parse(invalidPayload)).toThrow();
        });

        it('should reject callback payload with invalid job_id UUID', () => {
            const invalidPayload = {
                job_id: 'not-a-uuid',
                status: 'completed',
            };
            expect(() => ScrapeCallbackPayloadSchema.parse(invalidPayload)).toThrow();
        });

        it('should reject callback payload with invalid image URL in results', () => {
            const invalidPayload = {
                ...validCallbackPayload,
                results: {
                    ...validCallbackPayload.results,
                    data: {
                        'SKU-001': {
                            'scraper-a': {
                                price: 19.99,
                                images: ['not-a-valid-url'],
                            },
                        },
                    },
                },
            };
            expect(() => ScrapeCallbackPayloadSchema.parse(invalidPayload)).toThrow();
        });
    });

    describe('BatchMetadataSchema', () => {
        it('should parse valid batch metadata', () => {
            const metadata = {
                description: 'Test batch',
                auto_apply: true,
                use_web_search: false,
            };
            const result = BatchMetadataSchema.parse(metadata);
            expect(result.description).toBe('Test batch');
            expect(result.auto_apply).toBe(true);
        });

        it('should parse empty batch metadata', () => {
            const result = BatchMetadataSchema.parse({});
            expect(result).toEqual({});
        });
    });

    describe('BatchJobStatusSchema', () => {
        it('should accept valid batch job statuses', () => {
            const validStatuses = [
                'validating',
                'in_progress',
                'finalizing',
                'completed',
                'failed',
                'expired',
                'cancelled',
                'pending',
            ];
            for (const status of validStatuses) {
                expect(BatchJobStatusSchema.parse(status)).toBe(status);
            }
        });

        it('should reject invalid batch job status', () => {
            expect(() => BatchJobStatusSchema.parse('unknown')).toThrow();
        });
    });

    describe('SubmitBatchResponseSchema', () => {
        const validResponse = {
            success: true,
            batch_id: '550e8400-e29b-41d4-a716-446655440000',
            product_count: 50,
        };

        it('should parse valid submit batch response', () => {
            const result = SubmitBatchResponseSchema.parse(validResponse);
            expect(result.success).toBe(true);
            expect(result.batch_id).toBe('550e8400-e29b-41d4-a716-446655440000');
        });

        it('should reject response without success field', () => {
            const invalidResponse = {
                batch_id: '550e8400-e29b-41d4-a716-446655440000',
                product_count: 50,
            };
            expect(() => SubmitBatchResponseSchema.parse(invalidResponse)).toThrow();
        });

        it('should reject response with success: false', () => {
            const invalidResponse = { ...validResponse, success: false };
            expect(() => SubmitBatchResponseSchema.parse(invalidResponse)).toThrow();
        });
    });
});
