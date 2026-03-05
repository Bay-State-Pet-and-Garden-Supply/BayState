/**
 * Utility to determine the base URL for redirects, especially for authentication.
 * Handles local development, Vercel previews, and production environments.
 */
export function getURL() {
    let url =
        process.env.NEXT_PUBLIC_SITE_URL || // Set this to your site URL in production env.
        process.env.NEXT_PUBLIC_VERCEL_URL || // Automatically set by Vercel.
        process.env.VERCEL_URL || // Automatically set by Vercel.
        'http://localhost:3000/';

    // Include `https://` when not localhost
    url = url.includes('http') ? url : `https://${url}`;

    // Ensure the URL has a trailing slash
    url = url.endsWith('/') ? url : `${url}/`;

    console.log('[getURL] Resolved URL:', url);
    return url;
}
