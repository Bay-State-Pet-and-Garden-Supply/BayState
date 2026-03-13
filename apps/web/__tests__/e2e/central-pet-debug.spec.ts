import { test, expect } from '@playwright/test';

test('debug central pet search', async ({ page }) => {
  const sku = '38777520';
  const url = `https://www.centralpet.com/Search?criteria=${sku}`;
  
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  console.log('Page loaded. Waiting 10 seconds for dynamic content...');
  await page.waitForTimeout(10000);
  
  console.log('Current URL:', page.url());
  
  const content = await page.content();
  console.log('Page title:', await page.title());
  
  // Check for common elements
  const hasErp = await page.locator('#tst_productDetail_erpDescription').isVisible();
  console.log('Has #tst_productDetail_erpDescription:', hasErp);
  
  const hasNoResults = await page.locator('span.no-results-found, .no-results').isVisible();
  console.log('Has No Results indicators:', hasNoResults);
  
  // Take a screenshot
  await page.screenshot({ path: 'central-pet-debug.png', fullPage: true });
  console.log('Screenshot saved to central-pet-debug.png');
});
