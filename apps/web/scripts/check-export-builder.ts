import { loadPublishedShopSiteExport } from '../lib/shopsite/export-builder';

async function check() {
  try {
    const { products } = await loadPublishedShopSiteExport();
    console.log('Products returned by loadPublishedShopSiteExport:', products.length);
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
