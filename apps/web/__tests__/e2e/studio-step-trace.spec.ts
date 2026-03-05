import { test, expect } from '@playwright/test';

test.describe('Scraper Studio Step Trace View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.click('text=History');
  });

  test('should render history tab with test runs list', async ({ page }) => {
    await expect(page.locator('text=Test Run History')).toBeVisible();
    
    await page.screenshot({ path: '.sisyphus/evidence/task-12-history-tab.png' });
  });

  test('should show step trace when viewing a test run', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      await expect(page.locator('text=No test runs found')).toBeVisible();
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await expect(page.locator('text=Step Trace')).toBeVisible();
    
    await page.click('text=Step Trace');
    
    await expect(page.locator('text=Step Execution Summary')).toBeVisible();
    
    await page.screenshot({ path: '.sisyphus/evidence/task-12-step-trace.png' });
  });

  test('should show step details when expanding', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await page.click('text=Step Trace');
    
    await expect(page.locator('text=Step Execution Summary')).toBeVisible();
    
    const expandButtons = await page.locator('button[class*="h-8 w-8 p-0"]').count();
    
    if (expandButtons > 0) {
      await page.locator('button[class*="h-8 w-8 p-0"]').first().click();
      
      await page.waitForTimeout(300);
      
      const hasStarted = await page.locator('text=Started').first().isVisible().catch(() => false);
      const hasCompleted = await page.locator('text=Completed').first().isVisible().catch(() => false);
      const hasDuration = await page.locator('text=Duration').first().isVisible().catch(() => false);
      
      expect(hasStarted || hasCompleted || hasDuration).toBeTruthy();
      
      await page.screenshot({ path: '.sisyphus/evidence/task-12-expanded-step.png' });
    }
  });

  test('should show error details for failed steps', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await page.click('text=Step Trace');
    
    const failedSteps = await page.locator('text=Failed').count();
    
    if (failedSteps > 0) {
      const expandButtons = await page.locator('button[class*="h-8 w-8 p-0"]').count();
      
      if (expandButtons > 0) {
        await page.locator('button[class*="h-8 w-8 p-0"]').first().click();
        
        await page.waitForTimeout(300);
        
        const hasRetryButton = await page.locator('text=Retry Step').first().isVisible().catch(() => false);
        
        if (hasRetryButton) {
          await expect(page.locator('text=Error Details')).toBeVisible();
          
          await page.screenshot({ path: '.sisyphus/evidence/task-12-failed-step-retry.png' });
        }
      }
    }
  });

  test('should show overview tab with run information', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await page.click('text=Overview');
    
    await expect(page.locator('text=Run Information')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
    
    await page.screenshot({ path: '.sisyphus/evidence/task-12-overview-tab.png' });
  });

  test('should show SKU results tab', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await page.click('text=SKU Results');
    
    await expect(page.locator('text=SKU Test Results')).toBeVisible();
    
    await page.screenshot({ path: '.sisyphus/evidence/task-12-sku-results.png' });
  });

  test('should navigate back to history list', async ({ page }) => {
    const testRunCards = await page.locator('[class*="cursor-pointer"]').count();
    
    if (testRunCards === 0) {
      return;
    }

    await page.locator('[class*="cursor-pointer"]').first().click();
    
    await expect(page.locator('text=Test Run Details')).toBeVisible();
    
    await page.click('text=Back to History');
    
    await expect(page.locator('text=Test Run History')).toBeVisible();
    
    await page.screenshot({ path: '.sisyphus/evidence/task-12-back-to-history.png' });
  });
});
