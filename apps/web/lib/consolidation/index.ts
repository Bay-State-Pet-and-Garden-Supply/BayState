/**
 * Consolidation Module
 *
 * Public API for the provider-neutral consolidation batch system.
 */

// Types
export type {
    BatchStatus,
    ConsolidationResult,
    ProductSource,
    SubmitBatchResponse,
} from './types';

// Batch Service
export {
    submitBatch,
    getBatchStatus,
    retrieveResults,
    listBatchJobs,
    cancelBatch,
    processBatchQueue,
    processAllQueues,
} from './batch-service';

// Apply Service
export {
    applyResults,
} from './apply-service';

// OpenAI Client
export { isOpenAIConfigured } from './openai-client';



// Prompt Builder

// Taxonomy Validator
// Result Normalizer

// Evaluation helpers
// Parallel run tracking
export {
    syncPendingParallelRuns,
} from './parallel-runs';

// Two-phase consolidation
export {
    buildDefaultConsistencyRules,
    TwoPhaseConsolidationService,
} from './two-phase-service';

