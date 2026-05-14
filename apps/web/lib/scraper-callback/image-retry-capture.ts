import { ImageCaptureErrorType } from '@/lib/image-capture-errors';
import type { ImageRetryCaptureRequest, ImageRetryCaptureResult } from './image-retry-processor';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Production captureImage implementation using HTTP fetch.
 *
 * For non-login images: performs a HEAD request to verify the image is
 * publicly accessible. Returns success if the response is OK and the
 * content-type starts with "image/".
 *
 * For login-protected images: the HTTP fetch will typically fail with
 * 401/403. The retry processor's reauthenticate flow will queue a scraper
 * job to capture the image in an authenticated browser context.
 */
export async function httpFetchCaptureImage(
  request: ImageRetryCaptureRequest,
): Promise<ImageRetryCaptureResult> {
  try {
    const response = await fetch(request.imageUrl, {
      method: 'HEAD',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'BayState-ImageRetry/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().startsWith('image/')) {
        return { success: true, imageUrl: request.imageUrl };
      }
      return {
        success: false,
        errorType: ImageCaptureErrorType.UNKNOWN,
        errorMessage: `Unexpected content-type: ${contentType}`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        errorType: ImageCaptureErrorType.AUTH_401,
        errorMessage: `HTTP ${response.status}`,
      };
    }

    if (response.status === 404) {
      return {
        success: false,
        errorType: ImageCaptureErrorType.NOT_FOUND_404,
        errorMessage: 'HTTP 404',
      };
    }

    return {
      success: false,
      errorType: ImageCaptureErrorType.UNKNOWN,
      errorMessage: `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (
      lower.includes('timeout') ||
      lower.includes('abort') ||
      lower.includes('failed to fetch') ||
      lower.includes('network')
    ) {
      return {
        success: false,
        errorType: ImageCaptureErrorType.NETWORK_TIMEOUT,
        errorMessage: message,
      };
    }

    return {
      success: false,
      errorType: ImageCaptureErrorType.UNKNOWN,
      errorMessage: message,
    };
  }
}
