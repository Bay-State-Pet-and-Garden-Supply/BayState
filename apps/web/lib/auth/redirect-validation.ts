/**
 * Validates that a redirect URL is safe (internal path only).
 * Prevents open redirect attacks by ensuring:
 * - URL starts with a single forward slash (relative path)
 * - URL does not start with protocol-relative paths (//)
 * - URL does not contain protocol schemes (://)
 * 
 * @param url - The URL to validate
 * @returns true if the URL is a safe internal redirect
 */
export function isValidRedirectUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must start with exactly one forward slash (not //)
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }

  // Must not contain protocol schemes
  if (url.includes('://')) {
    return false;
  }

  // Additional safety: block URLs with encoded characters that could bypass checks
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith('//') || decoded.includes('://')) {
      return false;
    }
  } catch {
    // Invalid URL encoding - reject
    return false;
  }

  return true;
}

/**
 * Returns a safe redirect URL, falling back to default if invalid.
 * 
 * @param url - The URL to validate
 * @param defaultUrl - Default URL to use if invalid (default: '/account')
 * @returns A safe redirect URL
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  defaultUrl = '/account'
): string {
  return isValidRedirectUrl(url) ? url : defaultUrl;
}
