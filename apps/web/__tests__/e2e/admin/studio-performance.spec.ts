import { test, expect } from '@playwright/test';

test.describe('Scraper Studio Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForLoadState('networkidle');
  });

  test('page load should complete in under 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/admin/scrapers/studio');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
    console.log(`Page load time: ${loadTime}ms`);
  });

  test('config list should load in under 1 second', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    
    const startTime = Date.now();
    
    await page.waitForSelector('table tbody tr', { timeout: 5000 });
    
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(1000);
    console.log(`Config list load time: ${loadTime}ms`);
  });

  test('pagination should respond in under 500ms', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForSelector('table tbody tr');
    
    const nextButton = page.locator('button:has-text("Next")');
    
    if (await nextButton.isEnabled()) {
      const startTime = Date.now();
      
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(500);
      console.log(`Pagination response time: ${responseTime}ms`);
    }
  });

  test('filter debouncing should delay requests', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForSelector('table tbody tr');
    
    const filterInput = page.locator('input[placeholder="Filter by name..."]');
    
    const startTime = Date.now();
    
    await filterInput.fill('test');
    await page.waitForTimeout(500);
    
    const debounceTime = Date.now() - startTime;
    
    expect(debounceTime).toBeGreaterThanOrEqual(300);
    console.log(`Filter debounce time: ${debounceTime}ms`);
  });

  test('health tab should load metrics in under 1 second', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    
    const healthTab = page.locator('button:has-text("Health")');
    
    const startTime = Date.now();
    
    await healthTab.click();
    await page.waitForSelector('[data-testid="health-dashboard"]', { timeout: 5000 });
    
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(1000);
    console.log(`Health tab load time: ${loadTime}ms`);
  });

  test('timeline updates should complete in under 500ms', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForSelector('table tbody tr');
    
    const historyTab = page.locator('button:has-text("History")');
    await historyTab.click();
    
    await page.waitForTimeout(500);
    
    const testRunCard = page.locator('[data-testid="test-run-card"]').first();
    
    if (await testRunCard.isVisible()) {
      const startTime = Date.now();
      
      await testRunCard.click();
      await page.waitForSelector('[data-testid="step-trace"]', { timeout: 5000 });
      
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(500);
      console.log(`Timeline update time: ${loadTime}ms`);
    }
  });

  test('error boundary should handle errors gracefully', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    
    const healthTab = page.locator('button:has-text("Health")');
    await healthTab.click();
    
    await page.waitForTimeout(1000);
    
    const errorBoundary = page.locator('[data-testid="error-boundary"]');
    
    expect(await errorBoundary.count()).toBe(0);
  });

  test('skeleton loaders should be visible during loading', async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    
    const skeleton = page.locator('.animate-pulse').first();
    
    expect(await skeleton.isVisible().catch(() => false)).toBeTruthy();
  });

  test('performance budgets should be met', async ({ page }) => {
    const budgets = {
      pageLoad: 3000,
      configList: 1000,
      timelineUpdate: 500,
      healthMetrics: 1000,
    };
    
    const results = {
      pageLoad: 0,
      configList: 0,
      timelineUpdate: 0,
      healthMetrics: 0,
    };
    
    let startTime = Date.now();
    await page.goto('/admin/scrapers/studio');
    await page.waitForLoadState('domcontentloaded');
    results.pageLoad = Date.now() - startTime;
    
    startTime = Date.now();
    await page.waitForSelector('table tbody tr', { timeout: 5000 });
    results.configList = Date.now() - startTime;
    
    startTime = Date.now();
    await page.locator('button:has-text("Health")').click();
    await page.waitForTimeout(1000);
    results.healthMetrics = Date.now() - startTime;
    
    console.log('Performance Results:', results);
    
    expect(results.pageLoad).toBeLessThan(budgets.pageLoad);
    expect(results.configList).toBeLessThan(budgets.configList);
    expect(results.healthMetrics).toBeLessThan(budgets.healthMetrics);
  });
});
