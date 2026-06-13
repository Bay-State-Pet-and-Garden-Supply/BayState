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

// Parallel run tracking
export {
    syncPendingParallelRuns,
} from './parallel-runs';

// Product Line Classification
export {
    CLASSIFICATION_THRESHOLD,
    extractClassificationEvidence,
    classifyProduct,
    isConfidentClassification,
} from './product-line-classification';

// Grouping Service
export {
    finalizeClassificationBatch,
    reassignProductsToLine,
    mergeProductLines,
    splitProductLine,
    renameProductLine,
} from './grouping-service';

// Product Lines
export {
    loadKnownProductLines,
    upsertProductLine,
    assignProductToLine,
    normalizeProductLineKey,
} from './product-lines';

// Product Line Dedup
export {
    deduplicateProductLines,
} from './product-line-dedup';

// Group Result Parsing
export {
    parseGroupConsolidationText,
} from './group-result-parsing';

// Batch Service
export {
    submitGroupConsolidationBatch,
    retrieveGroupConsolidationResults,
} from './batch-service';
