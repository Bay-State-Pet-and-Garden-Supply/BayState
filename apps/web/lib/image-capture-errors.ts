/**
 * Image Capture Error Classification Utilities
 * 
 * Provides error type classification, retry logic, and delay calculations
 * for image capture operations.
 */

/**
 * Enum representing different types of image capture errors
 */
export enum ImageCaptureErrorType {
  AUTH_401 = 'auth_401',
  NOT_FOUND_404 = 'not_found_404',
  NETWORK_TIMEOUT = 'network_timeout',
  CORS_BLOCKED = 'cors_blocked',
  UNKNOWN = 'unknown'
}

/**
 * Maximum retry counts per error type
 */
export const MAX_RETRIES: Record<ImageCaptureErrorType, number> = {
  [ImageCaptureErrorType.AUTH_401]: 2,
  [ImageCaptureErrorType.NOT_FOUND_404]: 0,
  [ImageCaptureErrorType.NETWORK_TIMEOUT]: 3,
  [ImageCaptureErrorType.CORS_BLOCKED]: 1,
  [ImageCaptureErrorType.UNKNOWN]: 2
};

/**
 * Classifies an HTTP error status code into an ImageCaptureErrorType
 * 
 * @param statusCode - HTTP status code (can be null for network failures)
 * @returns The classified error type
 */
export function classifyHttpError(statusCode: number | null): ImageCaptureErrorType {
  if (statusCode === 401) {
    return ImageCaptureErrorType.AUTH_401;
  }
  
  if (statusCode === 404) {
    return ImageCaptureErrorType.NOT_FOUND_404;
  }
  
  // Status code 0 indicates network failure/CORS issue in fetch/XHR
  if (statusCode === 0 || statusCode === null) {
    return ImageCaptureErrorType.NETWORK_TIMEOUT;
  }
  
  return ImageCaptureErrorType.UNKNOWN;
}

/**
 * Determines whether a retry should be attempted based on error type and current retry count
 * 
 * @param errorType - The type of error that occurred
 * @param retryCount - Number of retries already attempted
 * @param maxRetries - Optional override for max retries (defaults to MAX_RETRIES per type)
 * @returns Whether a retry should be attempted
 */
export function shouldRetry(
  errorType: ImageCaptureErrorType,
  retryCount: number,
  maxRetries: number = MAX_RETRIES[errorType]
): boolean {
  // 404 errors should never be retried - the resource doesn't exist
  if (errorType === ImageCaptureErrorType.NOT_FOUND_404) {
    return false;
  }
  
  // CORS errors should only be retried once (in case of transient network issues)
  if (errorType === ImageCaptureErrorType.CORS_BLOCKED && retryCount >= 1) {
    return false;
  }
  
  return retryCount < maxRetries;
}

/**
 * Calculates the delay before the next retry attempt using exponential backoff
 * 
 * @param errorType - The type of error that occurred
 * @param retryCount - Number of retries already attempted
 * @returns Delay in milliseconds before next retry
 */
export function getRetryDelay(
  errorType: ImageCaptureErrorType,
  retryCount: number
): number {
  // Exponential backoff: 1s, 2s, 4s, etc.
  return Math.pow(2, retryCount) * 1000;
}
