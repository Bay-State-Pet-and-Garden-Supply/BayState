/**
 * OAuth 2.0 Helper for B2B REST APIs.
 * Used by BCI (OrderCloud) and other OAuth-based providers.
 */

export interface OAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  grantType?: 'client_credentials' | 'password';
  username?: string;
  password?: string;
}

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
  scope?: string;
  refreshToken?: string;
}

export interface OAuthResult {
  success: boolean;
  token?: OAuthToken;
  error?: string;
}

/**
 * OAuth client for managing access tokens with automatic refresh.
 */
export class OAuthClient {
  private config: OAuthConfig;
  private cachedToken: OAuthToken | null = null;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Gets a valid access token, refreshing if necessary.
   */
  async getAccessToken(): Promise<OAuthResult> {
    // Check if cached token is still valid (with 60s buffer)
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
      return { success: true, token: this.cachedToken };
    }

    // Fetch new token
    return this.fetchToken();
  }

  /**
   * Fetches a new access token from the OAuth server.
   */
  private async fetchToken(): Promise<OAuthResult> {
    try {
      const body = this.buildTokenRequestBody();
      
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OAuth] Token request failed:', response.status, errorText);
        return { 
          success: false, 
          error: `Token request failed: ${response.status}` 
        };
      }

      const data = await response.json();

      const token: OAuthToken = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in || 3600,
        expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
        scope: data.scope,
        refreshToken: data.refresh_token,
      };

      this.cachedToken = token;
      return { success: true, token };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown OAuth error';
      console.error('[OAuth] Token fetch error:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Builds the token request body based on grant type.
   */
  private buildTokenRequestBody(): URLSearchParams {
    const params = new URLSearchParams();
    
    const grantType = this.config.grantType || 'client_credentials';
    params.append('grant_type', grantType);
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);

    if (this.config.scope) {
      params.append('scope', this.config.scope);
    }

    if (grantType === 'password') {
      if (this.config.username) params.append('username', this.config.username);
      if (this.config.password) params.append('password', this.config.password);
    }

    return params;
  }

  /**
   * Creates an Authorization header value.
   */
  async getAuthorizationHeader(): Promise<string | null> {
    const result = await this.getAccessToken();
    if (!result.success || !result.token) return null;
    return `${result.token.tokenType} ${result.token.accessToken}`;
  }

  /**
   * Clears the cached token (useful for testing or forced refresh).
   */
  clearCache(): void {
    this.cachedToken = null;
  }

  /**
   * Tests the OAuth configuration by attempting to fetch a token.
   */
  async testConnection(): Promise<boolean> {
    const result = await this.fetchToken();
    return result.success;
  }
}

/**
 * Creates an OAuth client for OrderCloud (BCI).
 */
export function createOrderCloudClient(
  clientId: string,
  clientSecret: string,
  environment: 'production' | 'sandbox' = 'production'
): OAuthClient {
  const tokenUrl = environment === 'production'
    ? 'https://auth.ordercloud.io/oauth/token'
    : 'https://sandboxauth.ordercloud.io/oauth/token';

  return new OAuthClient({
    tokenUrl,
    clientId,
    clientSecret,
    grantType: 'client_credentials',
  });
}

/**
 * Creates an OAuth client for Endless Aisles (Phillips).
 * Note: Phillips may use API key auth instead - this is a fallback.
 */
export function createEndlessAislesClient(
  apiKey: string,
  apiSecret: string
): OAuthClient {
  return new OAuthClient({
    tokenUrl: 'https://api.endlessaisles.io/oauth/token',
    clientId: apiKey,
    clientSecret: apiSecret,
    grantType: 'client_credentials',
  });
}
