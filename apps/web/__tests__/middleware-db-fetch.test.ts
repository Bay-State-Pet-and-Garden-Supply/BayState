/**
 * @jest-environment node
 */
import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@supabase/ssr');
const mockCreateServerClient = createServerClient as jest.Mock;

describe('Middleware role resolution', () => {
    let mockSupabase: any;
    let mockGetUser: jest.Mock;
    let mockFrom: jest.Mock;
    let profilesTableCalls: string[];
    const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
        profilesTableCalls = [];
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

        mockGetUser = jest.fn();
        mockFrom = jest.fn().mockImplementation((table: string) => {
            // Track all calls to any table
            profilesTableCalls.push(table);
            
            // Return a mock that allows chaining
            const mockSelect = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null })
                })
            });
            return { select: mockSelect };
        });

        mockSupabase = {
            auth: { getUser: mockGetUser },
            from: mockFrom,
        };
        mockCreateServerClient.mockReturnValue(mockSupabase);
    });

    afterAll(() => {
        if (originalSupabaseUrl === undefined) {
            delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        } else {
            process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
        }

        if (originalSupabaseAnonKey === undefined) {
            delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        } else {
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
        }
    });

    function createReq(path: string) {
        return new NextRequest(new URL(path, 'http://localhost'));
    }

    it('does not fetch profile when role exists in JWT app_metadata', async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: { role: 'admin' } } },
            error: null
        });

        const req = createReq('/admin/dashboard');
        await updateSession(req);

        const profilesCalls = profilesTableCalls.filter(t => t === 'profiles');
        expect(profilesCalls.length).toBe(0);
        expect(mockFrom).not.toHaveBeenCalledWith('profiles');
    });

    it('does not fetch profile when role exists in JWT user_metadata', async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: {}, user_metadata: { role: 'staff' } } },
            error: null
        });

        const req = createReq('/admin/products');
        const res = await updateSession(req);

        expect(res.status).not.toBe(307);
        expect(mockFrom).not.toHaveBeenCalledWith('profiles');
    });

    it('falls back to profiles lookup when JWT role is missing', async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: {} } },
            error: null
        });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(mockFrom).toHaveBeenCalledWith('profiles');
        expect(res.status).not.toBe(307);
    });

    it('falls back to profiles lookup when JWT role is customer', async () => {
        mockFrom.mockImplementationOnce((table: string) => {
            profilesTableCalls.push(table);
            return {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null })
                    })
                })
            };
        });

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: { role: 'customer' } } },
            error: null
        });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(mockFrom).toHaveBeenCalledWith('profiles');
        expect(res.status).not.toBe(307);
    });

    it('rejects user when JWT and profile roles are both customer', async () => {
        mockFrom.mockImplementationOnce((table: string) => {
            profilesTableCalls.push(table);
            return {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: { role: 'customer' }, error: null })
                    })
                })
            };
        });

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: { role: 'customer' } } },
            error: null
        });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(mockFrom).toHaveBeenCalledWith('profiles');
        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location') || '');
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('error')).toBe('unauthorized');
    });

    it('falls back to customer when profile lookup returns customer', async () => {
        mockFrom.mockImplementationOnce((table: string) => {
            profilesTableCalls.push(table);
            return {
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: { role: 'customer' }, error: null })
                    })
                })
            };
        });

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id', app_metadata: {} } },
            error: null
        });

        const req = createReq('/admin/dashboard');
        const res = await updateSession(req);

        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location') || '');
        expect(location.searchParams.get('message')).toContain('Admin access required');
    });
});
