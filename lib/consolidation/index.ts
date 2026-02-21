/**
 * Consolidation Module
 *
 * Public API for the OpenAI Batch API consolidation system.
 */

// Types
export type {
    BatchJob,
    BatchMetadata,
    BatchStatus,
    BatchJobStatus,
    ConsolidationResult,
    ConsolidatedData,
    ProductSource,
    SubmitBatchResponse,
    BatchErrorResponse,
    ApplyResultsResponse,
    Category,
    ProductType,
} from './types';

// Batch Service
export {
    submitBatch,
    getBatchStatus,
    retrieveResults,
    applyResults,
    applyConsolidationResults,
    listBatchJobs,
    cancelBatch,
    createBatchContent,
} from './batch-service';

// OpenAI Client
export { getOpenAIClient, isOpenAIConfigured, CONSOLIDATION_CONFIG } from './openai-client';

// Prompt Builder
export { getCategories, getProductTypes, generateSystemPrompt, buildPromptContext } from './prompt-builder';

// Taxonomy Validator
export {
    findClosestMatch,
    validateCategory,
    validateProductType,
    buildResponseSchema,
    validateConsolidationTaxonomy,
} from './taxonomy-validator';

// Result Normalizer
export { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
