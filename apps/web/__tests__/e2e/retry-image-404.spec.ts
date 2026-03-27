import { expect, test } from '@playwright/test';

test('404 image failures trigger one debounced retry request', async ({ page }) => {
  const baseUrl = 'http://127.0.0.1:3000';
  const retryRequests: Array<{ sku?: string; image_url?: string }> = [];

  await page.route(`${baseUrl}/broken-image.jpg`, async (route) => {
    await route.fulfill({ status: 404, body: 'missing' });
  });

  await page.route(`${baseUrl}/api/admin/scraping/retry-image`, async (route) => {
    retryRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, queued: true }),
    });
  });

  await page.setContent(`
    <img id="broken-image" src="${baseUrl}/broken-image.jpg" alt="broken" />
    <script>
      const debounceMs = 5 * 60 * 1000;
      const attempts = new Map();
      const image = document.getElementById('broken-image');
      const triggerRetry = () => {
        const retryKey = 'product-1:${baseUrl}/broken-image.jpg';
        const now = Date.now();
        const lastAttempt = attempts.get(retryKey);
        if (typeof lastAttempt === 'number' && now - lastAttempt < debounceMs) {
          return;
        }

        attempts.set(retryKey, now);
        void fetch('${baseUrl}/api/admin/scraping/retry-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: 'product-1',
            image_url: '${baseUrl}/broken-image.jpg',
          }),
        });
      };

      image.addEventListener('error', triggerRetry);
    </script>
  `);

  await page.waitForTimeout(250);
  await page.dispatchEvent('#broken-image', 'error');

  await expect.poll(() => retryRequests.length).toBe(1);
  expect(retryRequests[0]).toEqual({
    sku: 'product-1',
    image_url: `${baseUrl}/broken-image.jpg`,
  });
});
