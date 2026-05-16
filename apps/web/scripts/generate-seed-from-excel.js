const xlsx = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function uuidv5(name) {
    const namespace = Buffer.from('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'hex');
    const hash = crypto.createHash('sha1');
    hash.update(namespace);
    hash.update(name);
    const buffer = hash.digest();
    buffer[6] = (buffer[6] & 0x0f) | 0x50;
    buffer[8] = (buffer[8] & 0x3f) | 0x80;
    return buffer.toString('hex', 0, 16).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

const workbook = xlsx.readFile(path.join(process.env.HOME, 'Downloads/bay_state_ai_extraction_training_dataset_pruned.xlsx'));
const worksheet = workbook.Sheets['Training Rows'];
const data = xlsx.utils.sheet_to_json(worksheet);

let brandsSql = '-- Generated Brands from Excel\nINSERT INTO brands (id, name, slug) VALUES\n';
let productsSql = '-- Generated Products from Excel\nINSERT INTO products (id, brand_id, name, slug, upc, sku, price, stock_status, created_at, updated_at) VALUES\n';

const brands = new Map();
const products = [];

for (const row of data) {
    const upc = row['upc'] ? String(row['upc']).trim() : null;
    if (!upc) continue;
    
    const brandName = row['expected_brand'] || 'Unknown Brand';
    const productName = row['expected_normalized_name'] || row['imported_name'] || 'Unknown Product';
    
    let brandId;
    if (!brands.has(brandName)) {
        brandId = uuidv5('brand:' + brandName);
        brands.set(brandName, brandId);
    } else {
        brandId = brands.get(brandName);
    }
    
    const productId = uuidv5('product:' + upc);
    const slug = slugify(productName) + '-' + upc;
    
    // Some arbitrary defaults for seed data
    const price = 9.99;
    const stockStatus = 'in_stock';
    
    products.push({
        id: productId,
        brand_id: brandId,
        name: productName,
        slug: slug,
        upc: upc,
        sku: upc,
        price: price,
        stock_status: stockStatus
    });
}

const brandValues = Array.from(brands.entries()).map(([name, id]) => {
    return `('${id}', '${name.replace(/'/g, "''")}', '${slugify(name)}')`;
}).join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n';

const productValues = products.map(p => {
    return `('${p.id}', '${p.brand_id}', '${p.name.replace(/'/g, "''")}', '${p.slug}', '${p.upc}', '${p.sku}', ${p.price}, '${p.stock_status}', NOW(), NOW())`;
}).join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n';

const projectRoot = '/Users/nickborrello/Desktop/Projects/BayState';

fs.writeFileSync(path.join(projectRoot, 'apps/web/supabase/seed/01-taxonomy.sql'), brandsSql + brandValues);
fs.writeFileSync(path.join(projectRoot, 'apps/web/supabase/seed/02-products.sql'), productsSql + productValues);

console.log(`Generated ${brands.size} brands and ${products.length} products.`);