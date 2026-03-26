import { z } from 'zod';

export const PipelineStatusSchema = z.enum([
    'staging',
    'scraped',
    'consolidated',
    'approved',
    'published',
    'failed',
]);

export const NewPipelineStatusSchema = z.enum([
    'registered',
    'enriched',
    'finalized',
]);

export const TransitionalPipelineStatusSchema = z.union([
    PipelineStatusSchema,
    NewPipelineStatusSchema,
]);

export const PipelineProductInputSchema = z.object({
    name: z.string().optional(),
    price: z.number().optional(),
});

export const PipelineProductConsolidatedSchema = z.object({
    name: z.string().optional(),
    price: z.number().optional(),
    images: z.array(z.string().url()).optional(),
    brand_id: z.string().optional(),
    stock_status: z.string().optional(),
    category: z.string().optional(),
    product_type: z.string().optional(),
    product_on_pages: z.array(z.string()).optional(),
    weight: z.string().optional(),
    is_special_order: z.boolean().optional(),
});

export const PipelineProductSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    input: PipelineProductInputSchema,
    sources: z.record(z.string(), z.unknown()),
    consolidated: PipelineProductConsolidatedSchema,
    pipeline_status: PipelineStatusSchema,
    pipeline_status_new: NewPipelineStatusSchema.optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const StatusCountSchema = z.object({
    status: TransitionalPipelineStatusSchema,
    count: z.number().int().min(0),
});

export const BulkUpdateStatusSchema = z.object({
    skus: z.array(z.string().min(1)).min(1, 'At least one SKU is required'),
    newStatus: TransitionalPipelineStatusSchema,
});

export const GetProductsByStatusOptionsSchema = z.object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    search: z.string().optional(),
});

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type NewPipelineStatus = z.infer<typeof NewPipelineStatusSchema>;
export type TransitionalPipelineStatus = z.infer<typeof TransitionalPipelineStatusSchema>;
export type PipelineProduct = z.infer<typeof PipelineProductSchema>;
export type StatusCount = z.infer<typeof StatusCountSchema>;
export type BulkUpdateStatus = z.infer<typeof BulkUpdateStatusSchema>;
