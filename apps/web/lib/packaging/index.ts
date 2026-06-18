/**
 * Packaging Extraction and Title Normalization
 *
 * Entry point for packaging vision evidence and packaging-backed title composition.
 */

export {
    composePackagingTitle,
    shouldAutoApplyTitle,
    detectConflicts,
    CONFIDENCE_GATES,
} from './title-composer';

export type {
    PackagingFacts,
    FieldConfidence,
    PackagingContext,
    PackagingTitleSuggestion,
    PackagingTitleMode,
} from './title-composer';

export {
    createPackagingExtractionJobs,
    waitForPackagingExtractions,
    getLatestExtractionFacts,
    createWorkflowRun,
    updateWorkflowRun,
    storeTitleSuggestion,
    updateTitleSuggestion,
    buildImageUrlsByUpc,
} from './workflow';

export type {
    CreateExtractionJobsOptions,
    CreateExtractionJobsResponse,
    WaitForExtractionsResponse,
    LatestExtractionFacts,
} from './workflow';
