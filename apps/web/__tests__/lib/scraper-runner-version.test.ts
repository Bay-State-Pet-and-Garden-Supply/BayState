/**
 * @jest-environment node
 */

import {
    RUNNER_BUILD_ID_HEADER,
    RUNNER_BUILD_SHA_HEADER,
    RUNNER_RELEASE_CHANNEL_HEADER,
    buildRunnerBuildMetadata,
    getRunnerBuildCheck,
    type PublishedRunnerRelease,
} from '@/lib/scraper-runner-version';

describe('scraper-runner-version', () => {
    const expectedRelease: PublishedRunnerRelease = {
        channel: 'latest',
        buildId: 'build-123',
        buildSha: 'abc123def456',
        image: 'ghcr.io/example/scraper',
        digest: 'sha256:deadbeef',
        publishedAt: '2026-03-29T22:30:00.000Z',
        refName: 'master',
        sourceRef: 'refs/heads/master',
    };

    it('accepts runners on the published image build', () => {
        const check = getRunnerBuildCheck(
            {
                get: (name: string) => {
                    if (name === RUNNER_BUILD_ID_HEADER) {
                        return 'build-123';
                    }

                    if (name === RUNNER_BUILD_SHA_HEADER) {
                        return 'abc123def456';
                    }

                    return null;
                },
            },
            expectedRelease
        );

        expect(check.isCompatible).toBe(true);
        expect(check.status).toBe('current');
        expect(check.releaseChannel).toBe('latest');
    });

    it('rejects missing runner build ids once a release is published', () => {
        const check = getRunnerBuildCheck(
            {
                get: () => null,
            },
            expectedRelease
        );

        expect(check.isCompatible).toBe(false);
        expect(check.status).toBe('missing');
        expect(check.message).toContain(RUNNER_BUILD_ID_HEADER);
    });

    it('rejects outdated image builds', () => {
        const check = getRunnerBuildCheck(
            {
                get: (name: string) => (name === RUNNER_BUILD_ID_HEADER ? 'build-old' : null),
            },
            expectedRelease
        );

        expect(check.isCompatible).toBe(false);
        expect(check.status).toBe('outdated');
        expect(check.message).toContain('build-123');
    });

    it('allows runners when no coordinator release metadata exists yet', () => {
        const check = getRunnerBuildCheck(
            {
                get: (name: string) => {
                    if (name === RUNNER_RELEASE_CHANNEL_HEADER) {
                        return 'latest';
                    }

                    if (name === RUNNER_BUILD_ID_HEADER) {
                        return 'build-local';
                    }

                    return null;
                },
            },
            null
        );

        expect(check.isCompatible).toBe(true);
        expect(check.status).toBe('unconfigured');
        expect(check.isEnforced).toBe(false);
    });

    it('merges build compatibility metadata without dropping existing fields', () => {
        const check = getRunnerBuildCheck(
            {
                get: (name: string) => {
                    if (name === RUNNER_BUILD_ID_HEADER) {
                        return 'build-123';
                    }

                    if (name === RUNNER_BUILD_SHA_HEADER) {
                        return 'abc123def456';
                    }

                    return null;
                },
            },
            expectedRelease
        );

        const metadata = buildRunnerBuildMetadata(
            { region: 'us-east-1', auth_method: 'api_key' },
            check,
            '2026-03-29T22:30:00.000Z'
        );

        expect(metadata).toMatchObject({
            region: 'us-east-1',
            auth_method: 'api_key',
            version: 'deadbeef',
            build_id: 'build-123',
            build_sha: 'abc123def456',
            release_channel: 'latest',
            latest_build_id: 'build-123',
            latest_build_sha: 'deadbeef',
            build_compatible: true,
            build_check_reason: 'current',
            build_last_checked_at: '2026-03-29T22:30:00.000Z',
        });
    });
});
