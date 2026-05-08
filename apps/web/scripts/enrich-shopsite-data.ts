import fs from 'fs';
import readline from 'readline';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Ensure you have process.env.DEEPSEEK_API_KEY set
const deepseek = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
});

const XML_PATH = 'temp/web_inventory050726.xml';
const MAPPING_PATH = 'temp/canonical_mapping.json';
const ENRICHMENT_OUTPUT_PATH = 'temp/ai_enrichment_map.json';

interface CanonicalMap {
  categories: Record<string, string>;
  productTypes: Record<string, string>;
}

async function runEnrichment() {
  const canonicalMap: CanonicalMap = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8'));
  const validCategories = Array.from(new Set(Object.values(canonicalMap.categories)));
  const validProductTypes = Array.from(new Set(Object.values(canonicalMap.productTypes)));

  const fileStream = fs.createReadStream(XML_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentProduct: any = {};
  let inProduct = false;
  let currentTag = '';
  
  const productsToEnrich: any[] = [];

  console.log('Scanning XML for products missing categories/types...');

  for await (const line of rl) {
    const trimmedLine = line.trim();

    if (trimmedLine.includes('<Product>')) {
      inProduct = true;
      currentProduct = {};
      continue;
    }

    if (trimmedLine.includes('</Product>')) {
      inProduct = false;
      const cat = currentProduct['ProductField24'] || '';
      const type = currentProduct['ProductField25'] || '';
      
      if (!cat || !type) {
        productsToEnrich.push({
          sku: currentProduct['SKU'] || currentProduct['RecordNumber'],
          name: currentProduct['Name'] || '',
          description: currentProduct['Description'] || '',
          missingCategory: !cat,
          missingType: !type
        });
      }
      continue;
    }

    if (inProduct) {
      const match = trimmedLine.match(/<([^>]+)>(.*)<\/\1>/);
      if (match) {
        currentTag = match[1];
        currentProduct[currentTag] = match[2];
      }
    }
  }

  console.log(`Found ${productsToEnrich.length} products needing enrichment.`);
  
  // For demonstration, let's only process the first 10 products
  const batchSize = Math.min(10, productsToEnrich.length);
  console.log(`\nProcessing a sample batch of ${batchSize} products with AI...`);
  
  const enrichmentResults: Record<string, any> = {};

  for (let i = 0; i < batchSize; i++) {
    const product = productsToEnrich[i];
    console.log(`[${i+1}/${batchSize}] Inferring for: ${product.name} (SKU: ${product.sku})`);
    
    try {
      const { object } = await generateObject({
        model: deepseek('deepseek-chat'),
        schema: z.object({
          predictedCategory: z.string().describe(`Choose the best fit from this list: ${validCategories.join(', ')}. If none fit perfectly, invent a broad 1-2 word category.`),
          predictedType: z.string().describe(`Choose the best fit from this list: ${validProductTypes.join(', ')}. If none fit perfectly, invent a broad 1-2 word product type.`),
          confidence: z.number().min(0).max(1).describe('Confidence score from 0.0 to 1.0')
        }),
        prompt: `
          Analyze the following product and categorize it.
          Product Name: ${product.name}
          Product Description: ${product.description}
          
          Missing Category: ${product.missingCategory}
          Missing Product Type: ${product.missingType}
        `,
      });

      enrichmentResults[product.sku] = {
        name: product.name,
        predictedCategory: product.missingCategory ? object.predictedCategory : null,
        predictedType: product.missingType ? object.predictedType : null,
        confidence: object.confidence
      };
      
    } catch (e) {
      console.error(`Failed to process SKU ${product.sku}`, e);
    }
  }

  fs.writeFileSync(ENRICHMENT_OUTPUT_PATH, JSON.stringify(enrichmentResults, null, 2));
  console.log(`\nSample enrichment complete. Results saved to ${ENRICHMENT_OUTPUT_PATH}`);
  console.log('Review the results before running a full batch process.');
}

runEnrichment().catch(console.error);
