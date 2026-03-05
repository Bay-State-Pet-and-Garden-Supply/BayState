import { test, expect } from '@playwright/test';

test('timeline component structure', async ({ page }) => {
  await page.goto('/admin/scrapers/test-lab');
  
  await expect(page).toHaveTitle(/Test Lab/);
});
