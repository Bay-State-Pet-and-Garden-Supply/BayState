import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export type ValidationResult<T> =
    | { success: true; data: T }
    | { success: false; error: NextResponse };

export async function validateRequest<T>(
    request: NextRequest,
    schema: z.ZodSchema<T>,
    options?: {
        parseJson?: boolean;
    }
): Promise<ValidationResult<T>> {
    try {
        let data: T;
        
        if (options?.parseJson !== false) {
            const bodyText = await request.text();
            data = schema.parse(JSON.parse(bodyText));
        } else {
            data = schema.parse(request);
        }
        
        return { success: true, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: NextResponse.json(
                    { error: 'Validation failed', issues: error.issues },
                    { status: 400 }
                ),
            };
        }
        
        return {
            success: false,
            error: NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            ),
        };
    }
}

export function createValidationMiddleware<T>(
    schema: z.ZodSchema<T>
) {
    return async function (request: NextRequest): Promise<ValidationResult<T>> {
        return validateRequest(request, schema);
    };
}

export function withValidation<T>(
    schema: z.ZodSchema<T>,
    handler: (data: T, request: NextRequest) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const result = await validateRequest(request, schema);
        
        if ('error' in result) {
            return result.error;
        }
        
        return handler(result.data, request);
    };
}

export async function parseQueryParams<T>(
    searchParams: URLSearchParams,
    schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: NextResponse }> {
    try {
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
        
        const data = schema.parse(params);
        return { success: true, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: NextResponse.json(
                    { error: 'Invalid query parameters', issues: error.issues },
                    { status: 400 }
                ),
            };
        }
        
        return {
            success: false,
            error: NextResponse.json(
                { error: 'Invalid query parameters' },
                { status: 400 }
            ),
        };
    }
}

export { z };
