import path from 'node:path';
import { createRequire } from 'node:module';
import nextJest from 'next/jest.js';

const require = createRequire(import.meta.url);

const reactEntry = require.resolve('react').replaceAll('\\', '/');
const reactDomEntry = require.resolve('react-dom').replaceAll('\\', '/');
const reactDomDir = path.dirname(require.resolve('react-dom/package.json')).replaceAll('\\', '/');

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^bun:test$': '<rootDir>/test-utils/bun-test.ts',
        '^react$': reactEntry,
        '^react-dom$': reactDomEntry,
        '^react-dom/(.*)$': `${reactDomDir}/$1`,
    },
    // Exclude Playwright tests - they should run via `bunx playwright test` not Jest
    testPathIgnorePatterns: ['/node_modules/', '/.next/', '/a11y/', '/e2e/'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(customJestConfig);
