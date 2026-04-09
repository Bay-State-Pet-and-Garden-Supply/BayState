/**
 * Consolidation Module
 *
 * Public API for the provider-neutral consolidation batch system.
 */

// Types
export type {
    BatchJob,
    BatchMetadata,
    BatchStatus,
    BatchJobStatus,
    ParallelRunComparison,
    ParallelRunRecord,
    ParallelRunStatus,
    ConsolidationResult,
    ConsolidatedData,
    ProductSource,
    SubmitBatchResponse,
    BatchErrorResponse,
    ApplyResultsResponse,
    Category,
} from './types';

export type {
    ConsistencyIssue,
    ConsistencyReport,
    ConsistencyRule,
    ConsistencyRuleType,
    TwoPhaseConsolidationConfig,
    TwoPhaseConsolidationProductResult,
    TwoPhaseConsolidationResult,
    TwoPhaseSelection,
} from './two-phase-service';

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

// Evaluation helpers
export {
    calculateCompleteness,
    calculateTaxonomyCorrectness,
    compareConsolidationResults,
    summarizeComparisons,
} from './evaluation';

// Parallel run tracking
export {
    listParallelRuns,
    registerParallelRun,
    syncParallelRunComparison,
    syncPendingParallelRuns,
} from './parallel-runs';

// Two-phase consolidation
export {
    buildDefaultConsistencyRules,
    createTwoPhaseConsolidationService,
    TwoPhaseConsolidationService,
} from './two-phase-service';
