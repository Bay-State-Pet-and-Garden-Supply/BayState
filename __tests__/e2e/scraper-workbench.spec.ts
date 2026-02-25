import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const tabAssertions = [
  { name: /overview/i, testId: 'tab-content-overview' },
  { name: /configuration/i, testId: 'tab-content-configuration' },
  { name: /workflows/i, testId: 'tab-content-workflows' },
  { name: /test lab/i, testId: 'tab-content-test-lab' },
  { name: /history/i, testId: 'tab-content-history' },
];

async function ensureNoConsoleErrors(page: Page, action: () => Promise<void>) {
  const errors: string[] = [];
  const handler = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  };
  page.on('console', handler);
  try {
    await action();
  } finally {
    page.off('console', handler);
  }

  expect(errors, `Console errors detected: ${errors.join('; ')}`).toHaveLength(0);
}

test.describe('Scraper Workbench smoke tests', () => {
  test('scraper list loads without console errors', async ({ page }) => {
    await ensureNoConsoleErrors(page, async () => {
      await page.goto('/admin/scrapers/list');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText(/scrapers/i)).toBeVisible();
      await expect(page.getByTestId('scraper-list')).toBeVisible();
    });
  });

  test('workbench tabs render and switch', async ({ page }) => {
    await ensureNoConsoleErrors(page, async () => {
      await page.goto('/admin/scrapers/list');
      await page.waitForLoadState('domcontentloaded');
      const scraperCard = page.getByTestId('scraper-card').first();
      await expect(scraperCard).toBeVisible();
      const viewLink = scraperCard.getByTestId('scraper-card-view-link').first();
      await expect(viewLink).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/admin\/scrapers\/[^/]+$/),
        viewLink.click(),
      ]);
      await expect(page.getByTestId('scraper-workbench')).toBeVisible();
      for (const { name, testId } of tabAssertions) {
        const tab = page.getByRole('tab', { name });
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(page.getByTestId(testId)).toBeVisible();
      }
    });
  });
});
