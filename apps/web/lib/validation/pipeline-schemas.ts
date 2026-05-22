import { z } from 'zod';
import {
    PERSISTED_PIPELINE_STATUSES,
    PIPELINE_TABS,
} from '@/lib/pipeline/types';

export const PipelineStatusSchema = z.enum(PERSISTED_PIPELINE_STATUSES);

const PipelineStageSchema = z.enum(PIPELINE_TABS);

const PipelineProductInputSchema = z.object({
    name: z.string().optional(),
    price: z.number().optional(),
    legacy_filename: z.string().optional().nullable(),
});

const PipelineProductConsolidatedSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().optional(),
    images: z.array(z.string().url()).optional(),
    brand_id: z.string().optional(),
    stock_status: z.string().optional(),
    category: z.string().optional(),
    legacy_filename: z.string().optional().nullable(),
    weight: z.string().optional(),
    is_special_order: z.boolean().optional(),
    search_keywords: z.string().optional(),
    gtin: z.string().optional(),
    availability: z.string().optional(),
    minimum_quantity: z.number().int().min(0).optional(),
    is_taxable: z.boolean().optional(),
});

export const PipelineProductSchema = z.object({
    upc: z.string().min(1, 'UPC is required'),
    input: PipelineProductInputSchema,
    sources: z.record(z.string(), z.unknown()),
    consolidated: PipelineProductConsolidatedSchema,
    pipeline_status: PipelineStatusSchema,
    exported_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

const StatusCountSchema = z.object({
    status: PipelineStageSchema,
    count: z.number().int().min(0),
});

const BulkUpdateStatusSchema = z.object({
    upcs: z.array(z.string().min(1)).min(1, 'At least one UPC is required'),
    newStatus: PipelineStatusSchema,
});

const GetProductsByStatusOptionsSchema = z.object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    search: z.string().optional(),
});
