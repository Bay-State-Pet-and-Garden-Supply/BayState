import { B2BClient, B2BConfig, DistributorCode } from './types';
import { BCIClient } from './adapters/bci';
import { OrgillClient } from './adapters/orgill';
import { PhillipsClient } from './adapters/phillips';
import { PFXClient } from './adapters/pfx';
import { CentralClient } from './adapters/central';

export class B2BFactory {
  static getClient(distributor: DistributorCode, config: B2BConfig): B2BClient {
    switch (distributor) {
      case 'BCI':
        return new BCIClient(config);
      case 'ORGILL':
        return new OrgillClient(config);
      case 'PHILLIPS':
        return new PhillipsClient(config);
      case 'PFX':
        return new PFXClient(config);
      case 'CENTRAL':
        return new CentralClient(config);
      default:
        throw new Error(`Unknown distributor: ${distributor}`);
    }
  }

  static getSupportedDistributors(): DistributorCode[] {
    return ['BCI', 'ORGILL', 'PHILLIPS', 'PFX', 'CENTRAL'];
  }

  static getFeedType(distributor: DistributorCode): 'REST' | 'SFTP' | 'EDI' {
    switch (distributor) {
      case 'BCI':
      case 'PHILLIPS':
        return 'REST';
      case 'ORGILL':
      case 'PFX':
        return 'SFTP';
      case 'CENTRAL':
        return 'EDI';
    }
  }
}
