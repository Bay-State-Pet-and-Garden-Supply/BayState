import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, test } from '@jest/globals';

type MockableFn = (...args: unknown[]) => unknown;

const mockFn = <T extends MockableFn>(fn?: T) => jest.fn(fn);

export const mock = Object.assign(mockFn, {
  module: (path: string, factory: () => unknown) => {
    jest.mock(path, factory);
  },
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test };
