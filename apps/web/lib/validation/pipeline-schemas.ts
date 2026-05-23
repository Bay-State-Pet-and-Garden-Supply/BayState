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
    core: z.object({
        name: z.string().optional(),
        brand_name: z.string().optional().nullable(),
        brand_id: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        price: z.number().optional().nullable(),
        weight_lbs: z.number().optional().nullable(),
        category_id: z.string().optional().nullable(),
        canonical_category_breadcrumb: z.string().optional().nullable(),
        search_keywords: z.string().optional().nullable(),
        confidence_score: z.number().min(0).max(1).optional().nullable(),
        stock_status: z.string().optional().nullable(),
        availability: z.string().optional().nullable(),
        minimum_quantity: z.number().int().min(0).optional().nullable(),
        is_special_order: z.boolean().optional().nullable(),
        is_taxable: z.boolean().optional().nullable(),
    }).optional(),
    facets: z.array(z.object({
        definition_slug: z.string(),
        value: z.string(),
        confidence_score: z.number().min(0).max(1).optional().nullable(),
        evidence_source: z.string().optional().nullable(),
    })).optional(),
    media: z.array(z.object({
        url: z.string().url(),
        role: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
        confidence_score: z.number().min(0).max(1).optional().nullable(),
    })).optional(),
    evidence: z.object({
        source_urls: z.array(z.string().url()).optional(),
        selected_images: z.array(z.string().url()).optional(),
        image_text: z.string().optional().nullable(),
        extraction_notes: z.string().optional().nullable(),
    }).optional(),
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
