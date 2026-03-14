declare module 'jest-axe' {
  import { MatcherFunction } from 'expect';

  export const axe: (html: unknown, options?: unknown) => Promise<unknown>;
  export const toHaveNoViolations: {
    toHaveNoViolations: MatcherFunction<[]>;
  };

  export interface JestAxeMatchers {
    toHaveNoViolations(): void;
  }
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveNoViolations(): R;
    }
  }
}
