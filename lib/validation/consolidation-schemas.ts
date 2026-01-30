import { z } from 'zod';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(message: string = 'Invalid UUID') {
    return z.string().regex(uuidRegex, message);
}

export const BatchJobStatusSchema = z.enum([
    'validating',
    'in_progress',
    'finalizing',
    'completed',
    'failed',
    'expired',
    'cancelled',
    'pending',
]);

export const BatchMetadataSchema = z.object({
    description: z.string().optional(),
    auto_apply: z.boolean().optional(),
    use_web_search: z.boolean().optional(),
});

export const BatchStatusSchema = z.object({
    id: uuid('Invalid batch ID'),
    status: BatchJobStatusSchema,
    is_complete: z.boolean(),
    is_failed: z.boolean(),
    is_processing: z.boolean(),
    total_requests: z.number().int().min(0),
    completed_requests: z.number().int().min(0),
    failed_requests: z.number().int().min(0),
    progress_percent: z.number().min(0).max(100),
    created_at: z.number().nullable().optional(),
    completed_at: z.number().nullable().optional(),
    metadata: BatchMetadataSchema,
});

export const BatchJobSchema = z.object({
    id: uuid('Invalid batch job ID'),
    status: z.string(),
    description: z.string().nullable().optional(),
    auto_apply: z.boolean(),
    total_requests: z.number().int().min(0),
    completed_requests: z.number().int().min(0),
    failed_requests: z.number().int().min(0),
    prompt_tokens: z.number().int().min(0),
    completion_tokens: z.number().int().min(0),
    total_tokens: z.number().int().min(0),
    estimated_cost: z.number().min(0),
    retry_count: z.number().int().min(0),
    max_retries: z.number().int().min(0),
    failed_skus: z.array(z.string()).nullable().optional(),
    parent_batch_id: z.string().nullable().optional(),
    input_file_id: z.string().nullable().optional(),
    output_file_id: z.string().nullable().optional(),
    error_file_id: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()),
    created_at: z.string(),
    updated_at: z.string(),
    completed_at: z.string().nullable().optional(),
    webhook_received_at: z.string().nullable().optional(),
    webhook_payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const ProductSourceSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    sources: z.record(z.string(), z.unknown()),
});

export const ConsolidationResultSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    name: z.string().optional(),
    brand: z.string().optional(),
    weight: z.string().optional(),
    price: z.string().optional(),
    category: z.string().optional(),
    product_type: z.string().optional(),
    product_on_pages: z.string().optional(),
    description: z.string().optional(),
    confidence_score: z.number().min(0).max(1).optional(),
    error: z.string().optional(),
});

export const ConsolidatedDataSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    images: z.array(z.string().url()).optional(),
    brand_id: z.string().optional(),
    stock_status: z.string().optional(),
    is_featured: z.boolean().optional(),
    category: z.string().optional(),
    product_type: z.string().optional(),
    weight: z.string().optional(),
    confidence_score: z.number().min(0).max(1).optional(),
});

export const SubmitBatchResponseSchema = z.object({
    success: z.literal(true),
    batch_id: uuid('Invalid batch ID'),
    product_count: z.number().int().min(1),
});

export const BatchErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string().min(1, 'Error message is required'),
});

export const ApplyResultsResponseSchema = z.object({
    status: z.literal('applied'),
    success_count: z.number().int().min(0),
    error_count: z.number().int().min(0),
    total: z.number().int().min(0),
    errors: z.array(z.string()).optional(),
});

export const CategorySchema = z.object({
    id: uuid('Invalid category ID'),
    name: z.string().min(1, 'Category name is required'),
    slug: z.string().nullable().optional(),
});

export const ProductTypeSchema = z.object({
    id: uuid('Invalid product type ID'),
    name: z.string().min(1, 'Product type name is required'),
});

export const ConsolidationSubmitSchema = z.object({
    skus: z.array(z.string().min(1)).min(1, 'At least one SKU is required'),
    description: z.string().optional(),
    auto_apply: z.boolean().optional(),
});

export const ScrapedDataItemSchema = z.object({
    price: z.number().min(0).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    images: z.array(z.string().url()).optional(),
    availability: z.string().optional(),
    ratings: z.number().min(0).max(5).optional(),
    reviews_count: z.number().int().min(0).optional(),
    url: z.string().url().optional(),
    scraped_at: z.string().optional(),
});

export const ScrapedDataSchema = z.record(z.string(), ScrapedDataItemSchema);

export const ScrapeCallbackPayloadSchema = z.object({
    job_id: uuid('Invalid job ID'),
    status: z.enum(['running', 'completed', 'failed']),
    runner_name: z.string().optional(),
    error_message: z.string().optional(),
    results: z
        .object({
            skus_processed: z.number().int().min(0).optional(),
            scrapers_run: z.array(z.string()).optional(),
            data: z.record(z.string(), ScrapedDataSchema).optional(),
        })
        .optional(),
});

export type BatchJobStatus = z.infer<typeof BatchJobStatusSchema>;
export type BatchJob = z.infer<typeof BatchJobSchema>;
export type ProductSource = z.infer<typeof ProductSourceSchema>;
export type ConsolidationResult = z.infer<typeof ConsolidationResultSchema>;
export type ConsolidatedData = z.infer<typeof ConsolidatedDataSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type ProductType = z.infer<typeof ProductTypeSchema>;
export type ConsolidationSubmit = z.infer<typeof ConsolidationSubmitSchema>;
export type ScrapeCallbackPayload = z.infer<typeof ScrapeCallbackPayloadSchema>;
