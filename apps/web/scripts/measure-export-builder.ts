import { loadPublishedShopSiteExport } from '../lib/shopsite/export-builder';

async function check() {
  const start = Date.now();
  try {
    const { products } = await loadPublishedShopSiteExport();
    const duration = Date.now() - start;
    console.log('Products returned:', products.length);
    console.log('Duration:', duration, 'ms');
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
