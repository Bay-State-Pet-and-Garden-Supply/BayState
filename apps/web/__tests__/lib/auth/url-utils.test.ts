import { getURL } from '@/lib/auth/url-utils';

describe('getURL', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns localhost by default', () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        delete process.env.NEXT_PUBLIC_VERCEL_URL;

        expect(getURL()).toBe('http://localhost:3000/');
    });

    it('returns NEXT_PUBLIC_SITE_URL when set', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://baystateapp.com';
        delete process.env.NEXT_PUBLIC_VERCEL_URL;

        expect(getURL()).toBe('https://baystateapp.com/');
    });

    it('returns NEXT_PUBLIC_VERCEL_URL when SITE_URL is missing', () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        process.env.NEXT_PUBLIC_VERCEL_URL = 'baystate-git-main-nick.vercel.app';

        expect(getURL()).toBe('https://baystate-git-main-nick.vercel.app/');
    });

    it('ensures trailing slash', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://site.com';
        expect(getURL()).toBe('https://site.com/');
    });

    it('preserves existing trailing slash', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://site.com/';
        expect(getURL()).toBe('https://site.com/');
    });

    it('adds https to vercel url if missing', () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        process.env.NEXT_PUBLIC_VERCEL_URL = 'preview.vercel.app';
        expect(getURL()).toBe('https://preview.vercel.app/');
    });
});
