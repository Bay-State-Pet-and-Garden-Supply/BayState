import { z } from 'zod';

export const PipelineStatusSchema = z.enum([
    'imported',
    'scraping',
    'scraped',
    'consolidating',
    'finalizing',
    'exporting',
    'failed',
]);

export const PipelineStageSchema = z.enum([
    'imported',
    'scraping',
    'scraped',
    'consolidating',
    'finalizing',
    'exporting',
    'failed',
]);

export const PipelineProductInputSchema = z.object({
    name: z.string().optional(),
    price: z.number().optional(),
});

export const PipelineProductConsolidatedSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    long_description: z.string().optional(),
    price: z.number().optional(),
    images: z.array(z.string().url()).optional(),
    brand_id: z.string().optional(),
    stock_status: z.string().optional(),
    category: z.string().optional(),

    product_on_pages: z.array(z.string()).optional(),
    weight: z.string().optional(),
    is_special_order: z.boolean().optional(),
    search_keywords: z.string().optional(),
    gtin: z.string().optional(),
    availability: z.string().optional(),
    minimum_quantity: z.number().int().min(0).optional(),
    is_taxable: z.boolean().optional(),
});

export const PipelineProductSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    input: PipelineProductInputSchema,
    sources: z.record(z.string(), z.unknown()),
    consolidated: PipelineProductConsolidatedSchema,
    pipeline_status: PipelineStatusSchema,
    exported_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const StatusCountSchema = z.object({
    status: PipelineStageSchema,
    count: z.number().int().min(0),
});

export const BulkUpdateStatusSchema = z.object({
    skus: z.array(z.string().min(1)).min(1, 'At least one SKU is required'),
    newStatus: PipelineStatusSchema,
});

export const GetProductsByStatusOptionsSchema = z.object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    search: z.string().optional(),
});

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineProduct = z.infer<typeof PipelineProductSchema>;
export type StatusCount = z.infer<typeof StatusCountSchema>;
export type BulkUpdateStatus = z.infer<typeof BulkUpdateStatusSchema>;
