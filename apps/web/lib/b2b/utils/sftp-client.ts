export interface SFTPConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface SFTPClientResult {
  success: boolean;
  data?: string;
  error?: string;
}

type SFTPClientConstructor = typeof import('ssh2-sftp-client');
type SFTPClientModule = {
  default: SFTPClientConstructor;
};

async function loadSFTPModule(): Promise<SFTPClientConstructor> {
  if (typeof window !== 'undefined') {
    throw new Error('SFTP client can only be used on the server');
  }
  const mod = (await import('ssh2-sftp-client')) as unknown as SFTPClientModule;
  return mod.default;
}

export class B2BSFTPClient {
  private config: SFTPConfig;

  constructor(config: SFTPConfig) {
    this.config = config;
  }
}

function createSFTPClient(
  feedConfig: { host?: string; port?: number; remotePath?: string },
  credentials: { username: string; password?: string; privateKey?: string }
): B2BSFTPClient {
  if (!feedConfig.host) {
    throw new Error('SFTP host is required');
  }

  return new B2BSFTPClient({
    host: feedConfig.host,
    port: feedConfig.port,
    username: credentials.username,
    password: credentials.password,
    privateKey: credentials.privateKey,
  });
}
