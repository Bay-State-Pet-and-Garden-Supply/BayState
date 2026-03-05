import { test, expect } from '@playwright/test';

test.describe('Scraper Studio Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    
    await page.click('text=Health');
  });

  test('should render health stats cards', async ({ page }) => {
    await expect(page.locator('text=Avg Pass Rate')).toBeVisible();
    await expect(page.locator('text=Total Failures')).toBeVisible();
    await expect(page.locator('text=Avg Duration')).toBeVisible();
  });

  test('should render charts', async ({ page }) => {
    await expect(page.locator('text=Pass/Fail Rate Trend')).toBeVisible();
    await expect(page.locator('text=Execution Duration Trend')).toBeVisible();
    
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
  });

  test('should render step metrics', async ({ page }) => {
    await expect(page.locator('text=Top Missed Selectors')).toBeVisible();
    await expect(page.locator('text=Frequent Step Failures')).toBeVisible();
  });
});
