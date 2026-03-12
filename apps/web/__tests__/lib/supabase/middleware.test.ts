/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
    NextRequest: class MockNextRequest {
        url: string;
        headers: Headers;
        cookies: {
            getAll: () => [];
        };
        nextUrl: {
            pathname: string;
            searchParams: URLSearchParams;
            clone: () => URL;
        };
        constructor(input: string | URL, init?: any) {
            const url = new URL(typeof input === 'string' ? input : input.toString());
            this.url = url.toString();
            this.headers = new Headers(init?.headers || {});
            this.cookies = { getAll: () => [] };
            this.nextUrl = {
                pathname: url.pathname,
                searchParams: url.searchParams,
                clone: () => new URL(url.toString()),
            };
        }
    },
    NextResponse: {
        next: () => ({
            status: 200,
            headers: new Headers(),
            cookies: {
                set: () => {},
            },
        }),
        redirect: (url: string | URL, status?: number) => ({
            status: status || 307,
            headers: new Headers({
                location: url.toString(),
            }),
        }),
    },
}));

jest.mock('next/headers', () => ({
    cookies: () => ({
        getAll: () => [],
    }),
}));

import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';

jest.mock('@supabase/ssr');
const mockCreateServerClient = createServerClient as jest.Mock;

describe('Middleware Auth Logic', () => {
    let mockSupabase: any;
    let mockGetUser: jest.Mock;
    let mockFrom: jest.Mock;
    const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    beforeEach(() => {
        jest.clearAllMocks();

        mockGetUser = jest.fn();
        mockFrom = jest.fn().mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { role: 'customer' }, error: null })
                })
            })
        }));

        mockSupabase = {
            auth: { getUser: mockGetUser },
            from: mockFrom,
        };
        mockCreateServerClient.mockReturnValue(mockSupabase);

        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    });

    afterAll(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    });

    function createReq(path: string) {
        return new NextRequest(new URL(path, 'http://localhost'));
    }

    it('redirects unauthenticated user from /admin to unified login', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location') || '');
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('next')).toBe('/admin/dashboard');
    });

    it('redirects customer role from /admin to login with error', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: { role: 'customer' } } }, error: null });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location') || '');
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('error')).toBe('unauthorized');
    });

    it('redirects staff role from /admin/users to /admin/orders (or dashboard?)', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', app_metadata: { role: 'staff' } } }, error: null });

        const req = createReq('/admin/users');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/admin');
        expect(res.headers.get('location')).not.toContain('/admin/users');
    });

    it('allows admin access to /admin/users', async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u3', app_metadata: { role: 'admin' } } }, error: null });

        const req = createReq('/admin/users');
        const res = await updateSession(req);

        expect(res.status).not.toBe(307);
        expect(res.headers.get('location')).toBeNull();
    });

    it('falls back to profiles role when JWT role is missing', async () => {
        mockFrom.mockImplementationOnce(() => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null })
                })
            })
        }));

        mockGetUser.mockResolvedValue({ data: { user: { id: 'u4', app_metadata: {} } }, error: null });

        const req = createReq('/admin/users');
        const res = await updateSession(req);

        expect(mockFrom).toHaveBeenCalledWith('profiles');
        expect(res.status).not.toBe(307);
    });

    it('redirects unauthenticated user from /account to /login with next param', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

        const req = createReq('/account/profile');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        const location = res.headers.get('location') || '';
        expect(location).toContain('/login');
        expect(location).toContain('next=%2Faccount%2Fprofile');
    });

    it('redirects to login when Supabase auth fetch throws', async () => {
        mockGetUser.mockRejectedValue(new Error('fetch failed'));

        const req = createReq('/account/profile');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location') || '');
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('next')).toBe('/account/profile');
    });
});
