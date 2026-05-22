import { getFilteredProducts } from './lib/products';

async function run() {
  try {
    console.log('Running getFilteredProducts()...');
    const result = await getFilteredProducts({ limit: 100 });
    console.log('Result count:', result.products.length);
    console.log('Result count value:', result.count);
    if (result.products.length > 0) {
      console.log('First product name:', result.products[0].name);
      console.log('First product values:', JSON.stringify(result.products[0], null, 2));
    }
  } catch (err) {
    console.error('Error running query:', err);
  }
}

run();
