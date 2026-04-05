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

// Taxonomy Validator
export {
    findClosestMatch,
    validateCategory,
    buildResponseSchema,
    validateRequiredConsolidationFields,
    validateConsolidationTaxonomy,
} from './taxonomy-validator';

// Result Normalizer
export { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
