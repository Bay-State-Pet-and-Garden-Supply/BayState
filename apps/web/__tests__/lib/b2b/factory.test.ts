import { B2BFactory } from '@/lib/b2b/factory';
import { OrgillClient } from '@/lib/b2b/adapters/orgill';
import { PhillipsClient } from '@/lib/b2b/adapters/phillips';
import { PFXClient } from '@/lib/b2b/adapters/pfx';
import { BCIClient } from '@/lib/b2b/adapters/bci';
import { CentralClient } from '@/lib/b2b/adapters/central';

describe('B2BFactory', () => {
  describe('getClient', () => {
    it('returns OrgillClient for ORGILL', () => {
      const client = B2BFactory.getClient('ORGILL', {});
      expect(client).toBeInstanceOf(OrgillClient);
    });

    it('returns PhillipsClient for PHILLIPS', () => {
      const client = B2BFactory.getClient('PHILLIPS', {});
      expect(client).toBeInstanceOf(PhillipsClient);
    });

    it('returns PFXClient for PFX', () => {
      const client = B2BFactory.getClient('PFX', {});
      expect(client).toBeInstanceOf(PFXClient);
    });

    it('returns BCIClient for BCI', () => {
      const client = B2BFactory.getClient('BCI', {});
      expect(client).toBeInstanceOf(BCIClient);
    });

    it('returns CentralClient for CENTRAL', () => {
      const client = B2BFactory.getClient('CENTRAL', {});
      expect(client).toBeInstanceOf(CentralClient);
    });

    it('throws for unknown distributor', () => {
      expect(() => {
        B2BFactory.getClient('UNKNOWN' as 'BCI', {});
      }).toThrow('Unknown distributor');
    });
  });

  describe('getSupportedDistributors', () => {
    it('returns all five distributors', () => {
      const distributors = B2BFactory.getSupportedDistributors();
      expect(distributors).toEqual(['BCI', 'ORGILL', 'PHILLIPS', 'PFX', 'CENTRAL']);
    });
  });

  describe('getFeedType', () => {
    it('returns REST for BCI and PHILLIPS', () => {
      expect(B2BFactory.getFeedType('BCI')).toBe('REST');
      expect(B2BFactory.getFeedType('PHILLIPS')).toBe('REST');
    });

    it('returns SFTP for ORGILL and PFX', () => {
      expect(B2BFactory.getFeedType('ORGILL')).toBe('SFTP');
      expect(B2BFactory.getFeedType('PFX')).toBe('SFTP');
    });

    it('returns EDI for CENTRAL', () => {
      expect(B2BFactory.getFeedType('CENTRAL')).toBe('EDI');
    });
  });
});
