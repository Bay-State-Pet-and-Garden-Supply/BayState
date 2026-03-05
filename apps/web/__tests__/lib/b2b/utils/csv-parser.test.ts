import { parseCSV, mapCSVToType } from '@/lib/b2b/utils/csv-parser';
import * as fs from 'fs';
import * as path from 'path';

describe('csv-parser', () => {
  describe('parseCSV', () => {
    it('parses simple CSV correctly', () => {
      const csv = `name,price,quantity
Product A,19.99,100
Product B,29.99,50`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.headers).toEqual(['name', 'price', 'quantity']);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Product A');
      expect(result.data[0].price).toBe('19.99');
    });

    it('handles quoted fields with commas', () => {
      const csv = `name,description
"Product A","Large, heavy item"
"Product B","Small item"`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.data[0].description).toBe('Large, heavy item');
    });

    it('handles escaped quotes', () => {
      const csv = `name,note
"Product ""A""","Has ""quotes"" inside"`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.data[0].name).toBe('Product "A"');
      expect(result.data[0].note).toBe('Has "quotes" inside');
    });

    it('skips empty lines by default', () => {
      const csv = `name,price
Product A,10

Product B,20

`;

      const result = parseCSV(csv);
      
      expect(result.data).toHaveLength(2);
    });

    it('parses PFX fixture file', () => {
      const fixturePath = path.join(process.cwd(), 'lib/b2b/__fixtures__/pfx-inventory.csv');
      const content = fs.readFileSync(fixturePath, 'utf-8');
      
      const result = parseCSV(content);
      
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]['Item #']).toBe('PFX-001');
    });
  });

  describe('mapCSVToType', () => {
    it('maps rows using string field names', () => {
      const rows = [
        { 'Item #': 'SKU-001', 'Description': 'Test Product' }
      ];
      
      interface Product {
        sku: string;
        name: string;
      }
      
      const mapping = {
        sku: 'Item #',
        name: 'Description',
      };
      
      const result = mapCSVToType<Product>(rows, mapping);
      
      expect(result[0].sku).toBe('SKU-001');
      expect(result[0].name).toBe('Test Product');
    });

    it('maps rows using transform functions', () => {
      const rows = [
        { 'Price': '19.99', 'Qty': '100' }
      ];
      
      interface Product {
        price: number;
        quantity: number;
      }
      
      const mapping = {
        price: (row: Record<string, string>) => parseFloat(row['Price']),
        quantity: (row: Record<string, string>) => parseInt(row['Qty'], 10),
      };
      
      const result = mapCSVToType<Product>(rows, mapping);
      
      expect(result[0].price).toBe(19.99);
      expect(result[0].quantity).toBe(100);
    });
  });
});
