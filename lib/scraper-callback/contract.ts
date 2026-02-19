import { ZodIssue, ZodSchema, z } from 'zod';

type JsonObject = Record<string, unknown>;

const SkuSourceSchema = z.record(z.string(), z.unknown());
const ScraperPayloadEntrySchema = z
    .record(z.string().min(1, 'scraper name is required'), SkuSourceSchema);

const ScraperResultsSchema = z.object({
    skus_processed: z.number().int().min(0).optional(),
    scrapers_run: z.array(z.string()).optional(),
    data: z.record(z.string().min(1, 'sku is required'), ScraperPayloadEntrySchema).optional(),
});

const ChunkResultsSchema = z.object({
    skus_processed: z.number().int().min(0).optional(),
    skus_successful: z.number().int().min(0).optional(),
    skus_failed: z.number().int().min(0).optional(),
    data: z.record(z.string().min(1, 'sku is required'), z.unknown()).optional(),
});

const ScraperCallbackPayloadSchema = z.object({
    job_id: z.string().min(1, 'job_id is required'),
    status: z.enum(['running', 'completed', 'failed']),
    runner_name: z.string().min(1).optional(),
    lease_token: z.string().min(1).optional(),
    error_message: z.string().min(1).optional(),
    results: ScraperResultsSchema.optional(),
});

const ChunkCallbackPayloadSchema = z.object({
    chunk_id: z.string().min(1, 'chunk_id is required'),
    job_id: z.string().optional(),
    status: z.enum(['completed', 'failed']),
    runner_name: z.string().min(1).optional(),
    results: ChunkResultsSchema.optional(),
    error_message: z.string().min(1).optional(),
});

type CallbackValidationError =
    | { type: 'invalid-json'; message: string }
    | { type: 'schema'; message: string; issues: ZodIssue[] };

type CallbackValidationSuccess<T> = { success: true; payload: T };
type CallbackValidationFailure = { success: false; error: CallbackValidationError };

export type CallbackValidationResult<T> =
    | CallbackValidationSuccess<T>
    | CallbackValidationFailure;

export const isCallbackValidationSuccess = <T>(result: CallbackValidationResult<T>): result is CallbackValidationSuccess<T> =>
    result.success === true;

function formatSchemaError(issues: ZodIssue[]): string {
    if (!issues.length) {
        return 'Invalid callback payload';
    }

    const details = issues
        .map((issue) => {
            const path = issue.path.length ? issue.path.join('.') : 'root';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return `Invalid callback payload: ${details}`;
}

function parseCallbackBody<T>(bodyText: string, schema: ZodSchema<T>): CallbackValidationResult<T> {
    try {
        const parsed = JSON.parse(bodyText);
        const result = schema.safeParse(parsed);

        if (!result.success) {
            return {
                success: false,
                error: {
                    type: 'schema',
                    message: formatSchemaError(result.error.issues),
                    issues: result.error.issues,
                },
            };
        }

        return { success: true, payload: result.data };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'invalid-json',
                message: 'Invalid JSON payload',
            },
        };
    }
}

export const parseScraperCallbackPayload = (bodyText: string): CallbackValidationResult<ScraperCallbackPayload> => {
    const decoded = parseCallbackBody(bodyText, ScraperCallbackPayloadSchema);
    if (!decoded.success) {
        return decoded;
    }

    if (decoded.payload.status === 'completed' && !decoded.payload.results?.data) {
        return {
            success: false,
            error: {
                type: 'schema',
                message: 'Completed callbacks must include results.data',
                issues: [],
            },
        };
    }

    return decoded;
};

export const parseChunkCallbackPayload = (bodyText: string): CallbackValidationResult<ChunkCallbackPayload> =>
    parseCallbackBody(bodyText, ChunkCallbackPayloadSchema);

export type ScraperCallbackPayload = z.infer<typeof ScraperCallbackPayloadSchema>;
export type ChunkCallbackPayload = z.infer<typeof ChunkCallbackPayloadSchema>;
export type ScraperResults = z.infer<typeof ScraperResultsSchema>;
