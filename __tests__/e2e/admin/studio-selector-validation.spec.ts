import { test, expect } from '@playwright/test';

test.describe('Studio Selector Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
  });

  test('History tab shows test run list', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    await expect(page.locator('text=Test Run History')).toBeVisible();
  });

  test('Selector validation tab is visible in test run details', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    const firstRun = page.locator('[class*="cursor-pointer"]').first();
    await firstRun.click();
    
    await expect(page.locator('[role="tab"]:has-text("Selectors")')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Step Trace")')).toBeVisible();
  });

  test('Selector validation displays summary cards', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    const firstRun = page.locator('[class*="cursor-pointer"]').first();
    await firstRun.click();
    
    await page.locator('[role="tab"]:has-text("Selectors")').click();
    
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=Found')).toBeVisible();
    await expect(page.locator('text=Missing')).toBeVisible();
    await expect(page.locator('text=Errors')).toBeVisible();
    await expect(page.locator('text=Required Failed')).toBeVisible();
  });

  test('Selector validation shows filter buttons', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    const firstRun = page.locator('[class*="cursor-pointer"]').first();
    await firstRun.click();
    
    await page.locator('[role="tab"]:has-text("Selectors")').click();
    
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Found")')).toBeVisible();
    await expect(page.locator('button:has-text("Missing")')).toBeVisible();
    await expect(page.locator('button:has-text("Errors")')).toBeVisible();
    await expect(page.locator('button:has-text("Required Only")')).toBeVisible();
  });

  test('Selector validation displays selector list when data exists', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    const firstRun = page.locator('[class*="cursor-pointer"]').first();
    await firstRun.click();
    
    await page.locator('[role="tab"]:has-text("Selectors")').click();
    
    await page.waitForTimeout(1000);
    
    const noDataMessage = page.locator('text=No selector validation data available');
    const selectorResults = page.locator('text=Selector Results');
    
    await expect(noDataMessage.or(selectorResults)).toBeVisible();
  });

  test('Back button returns to history list', async ({ page }) => {
    await page.locator('[role="tab"]:has-text("History")').click();
    
    const firstRun = page.locator('[class*="cursor-pointer"]').first();
    await firstRun.click();
    
    await expect(page.locator('text=Test Run Details')).toBeVisible();
    
    await page.locator('button:has-text("← Back to History")').click();
    
    await expect(page.locator('text=Test Run History')).toBeVisible();
  });
});
