/**
 * Real-time Scraper Health Actions
 * 
 * Server actions to fetch live health metrics from the scraper network.
 */

'use server';

/**
 * Fetch selector health metrics from the scraper backend.
 */
export async function getLiveSelectorHealth(site?: string, status?: 'unhealthy' | 'healthy' | 'all') {
    const scraperUrl = process.env.SCRAPER_BACKEND_URL || 'http://localhost:8000';
    const url = new URL(`${scraperUrl}/selector-health`);
    
    if (site) url.searchParams.append('site', site);
    if (status) url.searchParams.append('status', status);

    try {
        const response = await fetch(url.toString(), {
            next: { revalidate: 30 }, // Cache for 30 seconds
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch live selector health: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[getLiveSelectorHealth] Error:', error);
        return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Fetch site health overview from the scraper backend.
 */
export async function getLiveSiteHealth() {
    const scraperUrl = process.env.SCRAPER_BACKEND_URL || 'http://localhost:8000';
    const url = `${scraperUrl}/site-health`;

    try {
        const response = await fetch(url, {
            next: { revalidate: 60 }, // Cache for 1 minute
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch live site health: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[getLiveSiteHealth] Error:', error);
        return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }
}
