import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import {
  encryptSecret,
  getAIScrapingCredentialStatuses,
  getAIScrapingRuntimeCredentials,
  setAIScrapingProviderSecret,
} from '@/lib/ai-scraping/credentials';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

describe('AI scraping credentials compatibility', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SUPABASE_URL = 'https://baystate.example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('stores Gemini credentials in site_settings compatibility storage when the provider constraint is stale', async () => {
    const aiCredentialUpsert = jest.fn().mockResolvedValue({
      error: {
        message:
          'new row for relation "ai_provider_credentials" violates check constraint "ai_provider_credentials_provider_check"',
      },
    });
    const siteSettingsUpsert = jest.fn().mockResolvedValue({ error: null });

    (createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'ai_provider_credentials') {
          return {
            upsert: aiCredentialUpsert,
          };
        }

        if (table === 'site_settings') {
          return {
            upsert: siteSettingsUpsert,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await setAIScrapingProviderSecret('gemini', 'AIza-test-key-1234', 'user-1');

    expect(siteSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'ai_provider_credentials_compat_gemini',
        value: expect.objectContaining({
          provider: 'gemini',
          last4: '1234',
        }),
      }),
      { onConflict: 'key' }
    );
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('reads Gemini status from the compatibility fallback store without changing active OpenAI runtime defaults', async () => {
    const encrypted = encryptSecret('gemini-live-key-9876');
    const compatValue = {
      provider: 'gemini',
      encrypted_value: encrypted.encryptedValue,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: 1,
      last4: '9876',
      updated_at: '2026-04-06T20:00:00.000Z',
    };

    (createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'ai_provider_credentials') {
          return {
            select: (columns: string) => {
              if (columns === 'provider, last4, updated_at') {
                return Promise.resolve({
                  data: [{ provider: 'openai', last4: '1111', updated_at: '2026-04-06T19:00:00.000Z' }],
                  error: null,
                });
              }

              if (columns === 'encrypted_value, iv, auth_tag, last4, updated_at') {
                return {
                  eq: () => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                };
              }

              throw new Error(`Unexpected ai_provider_credentials select: ${columns}`);
            },
          };
        }

        if (table === 'site_settings') {
          return {
            select: (columns: string) => {
              if (columns === 'key, value, updated_at') {
                return {
                  in: () => Promise.resolve({
                    data: [
                      {
                        key: 'ai_provider_credentials_compat_gemini',
                        value: compatValue,
                        updated_at: '2026-04-06T20:00:00.000Z',
                      },
                    ],
                    error: null,
                  }),
                };
              }

              if (columns === 'value') {
                return {
                  eq: (_field: string, key: string) => ({
                    single: jest.fn().mockResolvedValue({
                      data:
                        key === 'ai_scraping_defaults'
                          ? {
                              value: {
                                llm_provider: 'openai',
                                llm_model: DEFAULT_AI_MODEL,
                                llm_base_url: null,
                                max_search_results: 5,
                                max_steps: 15,
                                confidence_threshold: 0.7,
                              },
                            }
                          : null,
                      error:
                        key === 'ai_scraping_defaults'
                          ? null
                          : { message: 'missing row' },
                    }),
                  }),
                };
              }

              if (columns === 'value, updated_at') {
                return {
                  eq: (_field: string, key: string) => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data:
                        key === 'ai_provider_credentials_compat_gemini'
                          ? {
                              value: compatValue,
                              updated_at: '2026-04-06T20:00:00.000Z',
                            }
                          : null,
                      error: null,
                    }),
                  }),
                };
              }

              throw new Error(`Unexpected site_settings select: ${columns}`);
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const statuses = await getAIScrapingCredentialStatuses();
    expect(statuses.gemini).toEqual({
      provider: 'gemini',
      configured: true,
      last4: '9876',
      updated_at: '2026-04-06T20:00:00.000Z',
    });

    const runtime = await getAIScrapingRuntimeCredentials();
    expect(runtime.llm_model).toBe(DEFAULT_AI_MODEL);
    expect(runtime.llm_api_key).toBeUndefined();
  });

  it('normalizes deprecated Gemini defaults back to OpenAI runtime defaults', async () => {
    const encrypted = encryptSecret('gemini-live-key-9876');
    const compatValue = {
      provider: 'gemini',
      encrypted_value: encrypted.encryptedValue,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: 1,
      last4: '9876',
      updated_at: '2026-04-06T20:00:00.000Z',
    };

    (createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'ai_provider_credentials') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'site_settings') {
          return {
            select: (columns: string) => {
              if (columns === 'value') {
                return {
                  eq: (_field: string, key: string) => ({
                    single: jest.fn().mockResolvedValue({
                      data:
                        key === 'ai_scraping_defaults'
                          ? {
                              value: {
                                llm_provider: 'gemini',
                                llm_model: 'gemini-2.5-flash',
                                llm_base_url: null,
                                max_search_results: 5,
                                max_steps: 15,
                                confidence_threshold: 0.7,
                              },
                            }
                          : null,
                      error:
                        key === 'ai_scraping_defaults'
                          ? null
                          : { message: 'missing row' },
                    }),
                  }),
                };
              }

              if (columns === 'value, updated_at') {
                return {
                  eq: (_field: string, key: string) => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data:
                        key === 'ai_provider_credentials_compat_gemini'
                          ? {
                              value: compatValue,
                              updated_at: '2026-04-06T20:00:00.000Z',
                            }
                          : null,
                      error: null,
                    }),
                  }),
                };
              }

              throw new Error(`Unexpected site_settings select: ${columns}`);
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const runtime = await getAIScrapingRuntimeCredentials();
    expect(runtime).toEqual({
      llm_provider: 'openai',
      llm_model: DEFAULT_AI_MODEL,
    });
  });
});
