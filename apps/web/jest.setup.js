import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream as WebReadableStream, TransformStream as WebTransformStream } from 'stream/web';

Object.assign(global, { TextEncoder, TextDecoder });

if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = WebReadableStream;
}

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

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = jest.fn();
}
