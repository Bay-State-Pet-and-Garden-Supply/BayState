
import fs from 'fs';
import readline from 'readline';

const XML_PATH = 'temp/web_inventory050726.xml';
const REPORT_PATH = 'temp/shopsite_audit_report.json';

interface AuditData {
  brands: Record<string, number>;
  categories: Record<string, number>;
  productTypes: Record<string, number>;
  missingCategoryCount: number;
  missingProductTypeCount: number;
  missingBrandCount: number;
  totalProducts: number;
}

async function runAudit() {
  const audit: AuditData = {
    brands: {},
    categories: {},
    productTypes: {},
    missingCategoryCount: 0,
    missingProductTypeCount: 0,
    missingBrandCount: 0,
    totalProducts: 0,
  };

  const fileStream = fs.createReadStream(XML_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentProduct: any = {};
  let inProduct = false;
  let currentTag = '';

  console.log('Starting audit of ShopSite XML...');

  for await (const line of rl) {
    const trimmedLine = line.trim();

    if (trimmedLine.includes('<Product>')) {
      inProduct = true;
      currentProduct = {};
      audit.totalProducts++;
      continue;
    }

    if (trimmedLine.includes('</Product>')) {
      inProduct = false;
      
      // Process Brand
      const brand = currentProduct['Brand'] || '';
      if (!brand) audit.missingBrandCount++;
      else audit.brands[brand] = (audit.brands[brand] || 0) + 1;

      // Process Category (PF24)
      const cat = currentProduct['ProductField24'] || '';
      if (!cat) audit.missingCategoryCount++;
      else audit.categories[cat] = (audit.categories[cat] || 0) + 1;

      // Process Product Type (PF25)
      const type = currentProduct['ProductField25'] || '';
      if (!type) audit.missingProductTypeCount++;
      else audit.productTypes[type] = (audit.productTypes[type] || 0) + 1;

      continue;
    }

    if (inProduct) {
      const match = trimmedLine.match(/<([^>]+)>(.*)<\/\1>/);
      if (match) {
        currentTag = match[1];
        const value = match[2];
        currentProduct[currentTag] = value;
      }
    }
  }

  // Sort results by frequency
  const sortedBrands = Object.entries(audit.brands).sort((a, b) => b[1] - a[1]);
  const sortedCategories = Object.entries(audit.categories).sort((a, b) => b[1] - a[1]);
  const sortedProductTypes = Object.entries(audit.productTypes).sort((a, b) => b[1] - a[1]);

  const finalReport = {
    summary: {
      totalProducts: audit.totalProducts,
      missingBrand: audit.missingBrandCount,
      missingCategory: audit.missingCategoryCount,
      missingProductType: audit.missingProductTypeCount,
    },
    topBrands: Object.fromEntries(sortedBrands),
    topCategories: Object.fromEntries(sortedCategories),
    topProductTypes: Object.fromEntries(sortedProductTypes),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(finalReport, null, 2));
  console.log(`Audit complete. Report saved to ${REPORT_PATH}`);
  
  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Total Products: ${audit.totalProducts}`);
  console.log(`Missing Category: ${audit.missingCategoryCount} (${((audit.missingCategoryCount/audit.totalProducts)*100).toFixed(1)}%)`);
  console.log(`Missing Product Type: ${audit.missingProductTypeCount} (${((audit.missingProductTypeCount/audit.totalProducts)*100).toFixed(1)}%)`);
  console.log(`Unique Brands: ${Object.keys(audit.brands).length}`);
  console.log(`Unique Categories: ${Object.keys(audit.categories).length}`);
}

runAudit().catch(console.error);
