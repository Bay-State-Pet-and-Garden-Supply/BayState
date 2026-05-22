import { scraperConfigRequiresLogin } from '@/lib/scraper-config-login';

describe('scraperConfigRequiresLogin', () => {
  it('returns false for null/undefined input', () => {
    expect(scraperConfigRequiresLogin(null)).toBe(false);
    expect(scraperConfigRequiresLogin(undefined)).toBe(false);
  });

  it('returns false for non-object input', () => {
    expect(scraperConfigRequiresLogin('string')).toBe(false);
    expect(scraperConfigRequiresLogin(42)).toBe(false);
    expect(scraperConfigRequiresLogin(true)).toBe(false);
  });

  it('returns true when requires_login === true', () => {
    const config = { requires_login: true };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns true when login is a non-null object (petfoodex-style)', () => {
    const config = {
      login: {
        url: 'https://example.com/signin',
        username_field: '#username',
        password_field: '#password',
      },
      // Notably: no requires_login
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns false when login is present but null', () => {
    const config = { login: null };
    expect(scraperConfigRequiresLogin(config)).toBe(false);
  });

  it('returns true when a workflow step action contains login keyword', () => {
    const config = {
      workflows: [
        { action: 'login', params: {} },
        { action: 'navigate', params: { url: 'https://example.com/search?q={upc}' } },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns true when a workflow step action contains "sign_in"', () => {
    const config = {
      workflows: [
        { action: 'sign_in', params: {} },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns true when workflow step params contain login keyword', () => {
    const config = {
      workflows: [
        {
          action: 'navigate',
          params: { url: 'https://example.com/login' },
        },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns true when workflow step params contain "password" reference', () => {
    const config = {
      workflows: [
        {
          action: 'fill_field',
          params: { selector: '#password', value: '{{credential.password}}' },
        },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('returns false for a non-login scraper (no login, no workflow keywords)', () => {
    const config = {
      workflows: [
        { action: 'navigate', params: { url: 'https://example.com/search?q={upc}' } },
        { action: 'extract', params: { fields: ['Name', 'Price'] } },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(false);
  });

  it('returns false for config without workflows', () => {
    const config = { base_url: 'https://example.com' };
    expect(scraperConfigRequiresLogin(config)).toBe(false);
  });

  it('is defensive against malformed workflow steps', () => {
    const config = {
      workflows: [null, undefined, 'string', 42, { action: 'navigate' }],
    };
    // No login keywords, so should return false
    expect(scraperConfigRequiresLogin(config)).toBe(false);
  });

  it('is case-insensitive when checking action keywords', () => {
    const config = {
      workflows: [
        { action: 'LOGIN', params: {} },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });

  it('is case-insensitive when checking params string', () => {
    const config = {
      workflows: [
        {
          action: 'fill',
          params: { field: 'Password' },
        },
      ],
    };
    expect(scraperConfigRequiresLogin(config)).toBe(true);
  });
});
