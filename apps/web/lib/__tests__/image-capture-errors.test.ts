/**
 * Tests for Image Capture Error Classification Utilities
 */

import {
  ImageCaptureErrorType,
  MAX_RETRIES,
  classifyHttpError,
  shouldRetry,
  getRetryDelay
} from '@/lib/image-capture-errors';

describe('ImageCaptureErrorType enum', () => {
  it('should have all expected error types', () => {
    expect(ImageCaptureErrorType.AUTH_401).toBe('auth_401');
    expect(ImageCaptureErrorType.NOT_FOUND_404).toBe('not_found_404');
    expect(ImageCaptureErrorType.NETWORK_TIMEOUT).toBe('network_timeout');
    expect(ImageCaptureErrorType.CORS_BLOCKED).toBe('cors_blocked');
    expect(ImageCaptureErrorType.UNKNOWN).toBe('unknown');
  });
});

describe('classifyHttpError', () => {
  it('should classify 401 as AUTH_401', () => {
    expect(classifyHttpError(401)).toBe(ImageCaptureErrorType.AUTH_401);
  });

  it('should classify 404 as NOT_FOUND_404', () => {
    expect(classifyHttpError(404)).toBe(ImageCaptureErrorType.NOT_FOUND_404);
  });

  it('should classify 0 as NETWORK_TIMEOUT', () => {
    expect(classifyHttpError(0)).toBe(ImageCaptureErrorType.NETWORK_TIMEOUT);
  });

  it('should classify null as NETWORK_TIMEOUT', () => {
    expect(classifyHttpError(null)).toBe(ImageCaptureErrorType.NETWORK_TIMEOUT);
  });

  it('should classify 500 as UNKNOWN', () => {
    expect(classifyHttpError(500)).toBe(ImageCaptureErrorType.UNKNOWN);
  });

  it('should classify 403 as UNKNOWN', () => {
    expect(classifyHttpError(403)).toBe(ImageCaptureErrorType.UNKNOWN);
  });

  it('should classify 502 as UNKNOWN', () => {
    expect(classifyHttpError(502)).toBe(ImageCaptureErrorType.UNKNOWN);
  });

  it('should classify 503 as UNKNOWN', () => {
    expect(classifyHttpError(503)).toBe(ImageCaptureErrorType.UNKNOWN);
  });

  it('should handle negative status codes as UNKNOWN', () => {
    expect(classifyHttpError(-1)).toBe(ImageCaptureErrorType.UNKNOWN);
  });
});

describe('MAX_RETRIES constants', () => {
  it('should have correct retry counts for each error type', () => {
    expect(MAX_RETRIES[ImageCaptureErrorType.AUTH_401]).toBe(2);
    expect(MAX_RETRIES[ImageCaptureErrorType.NOT_FOUND_404]).toBe(0);
    expect(MAX_RETRIES[ImageCaptureErrorType.NETWORK_TIMEOUT]).toBe(3);
    expect(MAX_RETRIES[ImageCaptureErrorType.CORS_BLOCKED]).toBe(1);
    expect(MAX_RETRIES[ImageCaptureErrorType.UNKNOWN]).toBe(2);
  });
});

describe('shouldRetry', () => {
  describe('NOT_FOUND_404', () => {
    it('should never retry on 404 errors', () => {
      expect(shouldRetry(ImageCaptureErrorType.NOT_FOUND_404, 0)).toBe(false);
      expect(shouldRetry(ImageCaptureErrorType.NOT_FOUND_404, 1)).toBe(false);
      expect(shouldRetry(ImageCaptureErrorType.NOT_FOUND_404, 10)).toBe(false);
    });
  });

  describe('AUTH_401', () => {
    it('should allow retry on first attempt', () => {
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 0)).toBe(true);
    });

    it('should allow retry on second attempt', () => {
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 1)).toBe(true);
    });

    it('should not retry after max retries reached', () => {
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 2)).toBe(false);
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 3)).toBe(false);
    });

    it('should respect custom maxRetries parameter', () => {
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 5, 10)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.AUTH_401, 10, 10)).toBe(false);
    });
  });

  describe('NETWORK_TIMEOUT', () => {
    it('should allow retry up to max retries', () => {
      expect(shouldRetry(ImageCaptureErrorType.NETWORK_TIMEOUT, 0)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.NETWORK_TIMEOUT, 1)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.NETWORK_TIMEOUT, 2)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.NETWORK_TIMEOUT, 3)).toBe(false);
    });
  });

  describe('CORS_BLOCKED', () => {
    it('should allow retry on first attempt', () => {
      expect(shouldRetry(ImageCaptureErrorType.CORS_BLOCKED, 0)).toBe(true);
    });

    it('should not retry after first attempt', () => {
      expect(shouldRetry(ImageCaptureErrorType.CORS_BLOCKED, 1)).toBe(false);
      expect(shouldRetry(ImageCaptureErrorType.CORS_BLOCKED, 2)).toBe(false);
    });
  });

  describe('UNKNOWN', () => {
    it('should allow retry up to max retries', () => {
      expect(shouldRetry(ImageCaptureErrorType.UNKNOWN, 0)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.UNKNOWN, 1)).toBe(true);
      expect(shouldRetry(ImageCaptureErrorType.UNKNOWN, 2)).toBe(false);
    });
  });
});

describe('getRetryDelay', () => {
  it('should return 1000ms for retry count 0', () => {
    expect(getRetryDelay(ImageCaptureErrorType.AUTH_401, 0)).toBe(1000);
  });

  it('should return 2000ms for retry count 1', () => {
    expect(getRetryDelay(ImageCaptureErrorType.AUTH_401, 1)).toBe(2000);
  });

  it('should return 4000ms for retry count 2', () => {
    expect(getRetryDelay(ImageCaptureErrorType.AUTH_401, 2)).toBe(4000);
  });

  it('should return 8000ms for retry count 3', () => {
    expect(getRetryDelay(ImageCaptureErrorType.AUTH_401, 3)).toBe(8000);
  });

  it('should work for all error types', () => {
    const errorTypes = Object.values(ImageCaptureErrorType);
    errorTypes.forEach(errorType => {
      expect(getRetryDelay(errorType, 0)).toBe(1000);
      expect(getRetryDelay(errorType, 1)).toBe(2000);
    });
  });

  it('should handle higher retry counts with exponential backoff', () => {
    expect(getRetryDelay(ImageCaptureErrorType.NETWORK_TIMEOUT, 4)).toBe(16000);
    expect(getRetryDelay(ImageCaptureErrorType.NETWORK_TIMEOUT, 5)).toBe(32000);
  });
});
