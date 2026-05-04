jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
    createAdminClient: jest.fn(),
}));

const { NextRequest, NextResponse } = require('next/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createClient, createAdminClient } = require('@/lib/supabase/server');

export {
    NextRequest,
    NextResponse,
    requireAdminAuth,
    createClient,
    createAdminClient,
};
