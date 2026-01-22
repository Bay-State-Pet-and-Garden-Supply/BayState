import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';

Object.assign(global, { TextEncoder, TextDecoder });

// Polyfill for TransformStream (required by Playwright MCP tests)
if (typeof global.TransformStream === 'undefined') {
  const { ReadableStream, WritableStream } = require('stream/web');
  global.TransformStream = class {
    constructor(transformer = {}) {
      this.readable = new ReadableStream({
        start(controller) {
          this._controller = controller;
        },
        cancel() {}
      });
      this.writable = new WritableStream({
        write(chunk, controller) {
          if (transformer.transform) {
            transformer.transform(chunk, this._controller, { forward: (c) => controller.enqueue(c) });
          } else {
            controller.enqueue(chunk);
          }
        },
        close() {},
        abort() {}
      });
    }
  };
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
