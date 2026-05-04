interface SFTPConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface SFTPDownloadResult {
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

  // fallow-ignore-next-line unused-class-member
  async downloadFile(remotePath: string): Promise<SFTPDownloadResult> {
    let client: InstanceType<SFTPClientConstructor> | null = null;

    try {
      const SFTPClient = await loadSFTPModule();
      client = new SFTPClient();
      await client.connect(this.config);
      const file = await client.get(remotePath);

      if (typeof file === 'string') {
        return { success: true, data: file };
      }

      if (Buffer.isBuffer(file)) {
        return { success: true, data: file.toString('utf8') };
      }

      if (file instanceof Uint8Array) {
        return { success: true, data: Buffer.from(file).toString('utf8') };
      }

      return { success: false, error: 'Unsupported SFTP response type' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SFTP error',
      };
    } finally {
      if (client) {
        await client.end().catch(() => undefined);
      }
    }
  }

  // fallow-ignore-next-line unused-class-member
  async testConnection(): Promise<boolean> {
    let client: InstanceType<SFTPClientConstructor> | null = null;

    try {
      const SFTPClient = await loadSFTPModule();
      client = new SFTPClient();
      await client.connect(this.config);
      return true;
    } catch {
      return false;
    } finally {
      if (client) {
        await client.end().catch(() => undefined);
      }
    }
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
