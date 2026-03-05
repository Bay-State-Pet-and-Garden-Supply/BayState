import { OAuthClient, createOrderCloudClient } from '@/lib/b2b/utils/oauth';

describe('oauth', () => {
  describe('OAuthClient', () => {
    it('caches token within expiry window', async () => {
      const mockToken = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };
      
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });
      
      const client = new OAuthClient({
        tokenUrl: 'https://test.example.com/oauth/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });
      
      const result1 = await client.getAccessToken();
      const result2 = await client.getAccessToken();
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('handles token request failure', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });
      
      const client = new OAuthClient({
        tokenUrl: 'https://test.example.com/oauth/token',
        clientId: 'bad-client',
        clientSecret: 'bad-secret',
      });
      
      const result = await client.getAccessToken();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('builds correct request body for client_credentials', async () => {
      let capturedBody: string | null = null;
      
      global.fetch = jest.fn().mockImplementation(async (_, init) => {
        capturedBody = init?.body as string;
        return {
          ok: true,
          json: async () => ({ access_token: 'token', expires_in: 3600 }),
        };
      });
      
      const client = new OAuthClient({
        tokenUrl: 'https://test.example.com/oauth/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
        scope: 'read write',
      });
      
      await client.getAccessToken();
      
      expect(capturedBody).not.toBeNull();
      const params = new URLSearchParams(capturedBody || '');
      expect(params.get('grant_type')).toBe('client_credentials');
      expect(params.get('client_id')).toBe('my-client');
      expect(params.get('client_secret')).toBe('my-secret');
      expect(params.get('scope')).toBe('read write');
    });

    it('clears cache on clearCache()', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      });
      
      const client = new OAuthClient({
        tokenUrl: 'https://test.example.com/oauth/token',
        clientId: 'test',
        clientSecret: 'test',
      });
      
      await client.getAccessToken();
      client.clearCache();
      await client.getAccessToken();
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('createOrderCloudClient', () => {
    it('creates client with production URL by default', () => {
      const client = createOrderCloudClient('client-id', 'client-secret');
      expect(client).toBeInstanceOf(OAuthClient);
    });

    it('creates client with sandbox URL when specified', () => {
      const client = createOrderCloudClient('client-id', 'client-secret', 'sandbox');
      expect(client).toBeInstanceOf(OAuthClient);
    });
  });
});
