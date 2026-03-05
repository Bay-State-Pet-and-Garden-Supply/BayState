import { test, expect } from '@playwright/test';

test('admin can view config list in scraper studio', async ({ page }) => {
  await page.goto('/admin/scrapers/studio');
  
  await expect(page.locator('h1')).toContainText('Scraper Studio');
  
  await expect(page.getByRole('tab', { name: 'Configs' })).toBeVisible();
  
  await expect(page.getByRole('button', { name: 'Name' })).toBeVisible();
  await expect(page.getByText('Domain')).toBeVisible();
  await expect(page.getByText('Versions')).toBeVisible();
  await expect(page.getByText('Health')).toBeVisible();
  
  await expect(page.getByRole('link', { name: 'New Config' })).toBeVisible();
  
  await page.screenshot({ path: '.sisyphus/evidence/task-4-config-list.png' });
});
