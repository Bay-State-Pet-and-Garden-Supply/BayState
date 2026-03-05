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

type SFTPClientModule = {
  default: new () => {
    connect(config: Record<string, unknown>): Promise<void>;
    get(remotePath: string): Promise<Buffer | string>;
    list(remotePath: string): Promise<Array<{ name: string }>>;
    cwd(): Promise<string>;
    end(): Promise<void>;
  };
};

async function loadSFTPModule(): Promise<SFTPClientModule['default']> {
  if (typeof window !== 'undefined') {
    throw new Error('SFTP client can only be used on the server');
  }
  const mod = await (eval('import("ssh2-sftp-client")') as Promise<SFTPClientModule>);
  return mod.default;
}

export class B2BSFTPClient {
  private config: SFTPConfig;

  constructor(config: SFTPConfig) {
    this.config = config;
  }

  async downloadFile(remotePath: string): Promise<SFTPClientResult> {
    try {
      const Client = await loadSFTPModule();
      const client = new Client();

      await client.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        readyTimeout: 30000,
        retries: 2,
        retry_minTimeout: 2000,
      });

      const buffer = await client.get(remotePath);
      await client.end();
      
      const data = Buffer.isBuffer(buffer) 
        ? buffer.toString('utf-8') 
        : String(buffer);

      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SFTP error';
      console.error(`[SFTP] Download failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async listDirectory(remotePath: string): Promise<{ success: boolean; files?: string[]; error?: string }> {
    try {
      const Client = await loadSFTPModule();
      const client = new Client();

      await client.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        readyTimeout: 30000,
      });

      const listing = await client.list(remotePath);
      await client.end();
      
      const files = listing.map((item) => item.name);
      return { success: true, files };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SFTP error';
      return { success: false, error: message };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const Client = await loadSFTPModule();
      const client = new Client();

      await client.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        readyTimeout: 10000,
      });

      await client.cwd();
      await client.end();
      return true;
    } catch (error) {
      console.error('[SFTP] Connection test failed:', error);
      return false;
    }
  }
}

export function createSFTPClient(
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
