/**
 * Client-side admin API helper.
 * Reads the admin API key from sessionStorage and includes it in requests.
 * Admin users should generate an API key and store it via the admin settings UI.
 */

const ADMIN_KEY_STORAGE = 'bs_admin_api_key';

function getStoredAdminKey(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

function storeAdminKey(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function clearAdminKey(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const key = getStoredAdminKey();
  const headers = new Headers(init?.headers);

  if (key) {
    headers.set('X-API-Key', key);
  } else {
    console.warn('[Admin API Client] adminFetch called without an API key in sessionStorage. This will likely result in a 401.');
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
