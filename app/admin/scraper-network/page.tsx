/**
 * Scraper Network Page (Legacy Route)
 *
 * This route now redirects to the full dashboard implementation.
 * The real implementation is at /admin/scrapers/network/scraper-network
 */

import { redirect } from 'next/navigation';

export default function ScraperNetworkPage() {
  redirect('/admin/scrapers/network/scraper-network');
}
