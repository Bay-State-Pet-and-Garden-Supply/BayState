import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';
import { TransformStream as WebTransformStream } from 'stream/web';
import { fetch, Headers, Request, Response } from 'undici';

Object.assign(global, { TextEncoder, TextDecoder, fetch, Headers, Request, Response });



// Polyfill for TransformStream (required by Playwright MCP tests)
if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = WebTransformStream;
}

// Mock next/cache for server action tests
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
    unstable_cache: jest.fn((fn) => fn),
}));

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};
