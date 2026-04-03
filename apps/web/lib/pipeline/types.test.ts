import { statusToTab, tabToQueryFilter } from './types';

describe('statusToTab', () => {
  it('keeps imported products in imported even if scrape jobs are active elsewhere', () => {
    expect(statusToTab('imported', true, false)).toBe('imported');
  });

  it('moves scraped products with active scrape jobs into scraping', () => {
    expect(statusToTab('scraped', true, false)).toBe('scraping');
  });

  it('keeps scraped products without active scrape jobs in scraped', () => {
    expect(statusToTab('scraped', false, false)).toBe('scraped');
  });

  it('maps finalized products based on active consolidation state', () => {
    expect(statusToTab('finalized', false, true)).toBe('consolidating');
    expect(statusToTab('finalized', false, false)).toBe('finalizing');
  });
});

describe('tabToQueryFilter', () => {
  it('uses scraped products plus active scrape jobs for the scraping tab', () => {
    expect(tabToQueryFilter('scraping')).toEqual({
      status: 'scraped',
      scrapeJobActive: true,
    });
  });

  it('uses scraped products without active scrape jobs for the scraped tab', () => {
    expect(tabToQueryFilter('scraped')).toEqual({
      status: 'scraped',
      scrapeJobActive: false,
    });
  });
});
