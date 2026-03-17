declare module 'bun:test' {
    export const describe: typeof global.describe;
    export const it: typeof global.it;
    export const test: typeof global.it;
    export const expect: typeof global.expect;
    export const beforeEach: typeof global.beforeEach;
    export const afterEach: typeof global.afterEach;
    export const beforeAll: typeof global.beforeAll;
    export const afterAll: typeof global.afterAll;
    export const mock: {
        <T extends (...args: unknown[]) => unknown>(fn?: T): jest.Mock<ReturnType<T>, Parameters<T>>;
        module(path: string, factory: () => unknown): void;
    };
}
