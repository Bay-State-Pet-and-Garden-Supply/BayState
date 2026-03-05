import { parseFixedWidth, parseFixedWidthLine, ORGILL_HD1_FIELDS } from '@/lib/b2b/utils/fixed-width';
import * as fs from 'fs';
import * as path from 'path';

describe('fixed-width parser', () => {
  describe('parseFixedWidthLine', () => {
    it('parses a valid HD1 line correctly', () => {
      // Line format: recordType(3) + distributorSku(12) + upc(12) + name(33) + price(8) + cost(8) + quantity(6) = 82 chars
      const line = 'HD1ORGILL-001  012345678901Acme Dog Food Large Breed 30lb   0000029900000185000250';
      
      const result = parseFixedWidthLine(line, ORGILL_HD1_FIELDS);
      
      expect(result).not.toBeNull();
      expect(result?.recordType).toBe('HD1');
      expect(result?.distributorSku).toBe('ORGILL-001');
      expect(result?.upc).toBe('012345678901');
      expect(result?.name).toBe('Acme Dog Food Large Breed 30lb');
      expect(result?.price).toBe(2.99);
      expect(result?.cost).toBe(1.85);
      expect(result?.quantity).toBe(250);
    });

    it('returns null for empty line', () => {
      expect(parseFixedWidthLine('', ORGILL_HD1_FIELDS)).toBeNull();
    });

    it('handles short lines gracefully', () => {
      const shortLine = 'HD1SHORT';
      const result = parseFixedWidthLine(shortLine, ORGILL_HD1_FIELDS);
      
      expect(result).not.toBeNull();
      expect(result?.recordType).toBe('HD1');
      expect(result?.distributorSku).toBe('SHORT');
    });
  });

  describe('parseFixedWidth', () => {
    it('parses fixture file correctly', () => {
      const fixturePath = path.join(process.cwd(), 'lib/b2b/__fixtures__/orgill-hd1-sample.txt');
      const content = fs.readFileSync(fixturePath, 'utf-8');
      
      const results = parseFixedWidth(content, ORGILL_HD1_FIELDS, { linePrefix: 'HD1' });
      
      expect(results).toHaveLength(5);
      expect(results[0].distributorSku).toBe('ORGILL-001');
      expect(results[0].price).toBe(2.99);
    });

    it('filters out non-HD1 lines', () => {
      const content = `HEADER LINE TO SKIP
HD1TEST-001     123456789012Product Name Here               000019990000099900000100
FOOTER LINE`;
      
      const results = parseFixedWidth(content, ORGILL_HD1_FIELDS, { linePrefix: 'HD1' });
      
      expect(results).toHaveLength(1);
      expect(results[0].distributorSku).toBe('TEST-001');
    });

    it('skips header lines when configured', () => {
      const content = `SKU,UPC,Name,Price
HD1TEST-001     123456789012Product Name Here               000019990000099900000100`;
      
      const results = parseFixedWidth(content, ORGILL_HD1_FIELDS, { 
        skipLines: 1,
        linePrefix: 'HD1' 
      });
      
      expect(results).toHaveLength(1);
    });
  });
});
