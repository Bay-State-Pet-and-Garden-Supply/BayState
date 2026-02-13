const { chromium } = require('/Users/nickborrello/Desktop/Projects/BayState/BayStateApp/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    console.log('Navigating to http://localhost:3000/admin/scraper-lab/6c5fd7ca-dbd3-420e-bdf3-411f1631e32e...');
    // We expect the redirect loop, so we catch the error but try to get info before it fails or if it partially loads
    await page.goto('http://localhost:3000/admin/scraper-lab/6c5fd7ca-dbd3-420e-bdf3-411f1631e32e').catch(e => console.log('Navigation failed as expected:', e.message));

    const finalUrl = page.url();
    console.log(`Final URL reached: ${finalUrl}`);

    await page.screenshot({ path: '/Users/nickborrello/Desktop/Projects/BayState/scraper-lab-test.png' });
    
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText : 'No body');
    console.log('\n--- Console Errors ---');
    console.log(consoleErrors.length > 0 ? consoleErrors.join('\n') : 'None');
    console.log('\n--- Page Content ---');
    console.log(bodyText);

  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    await browser.close();
  }
})();
