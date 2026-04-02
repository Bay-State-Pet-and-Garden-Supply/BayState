import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const RUNNER_BUILD_ID_HEADER = 'X-BayState-Runner-Build-Id';
export const RUNNER_BUILD_SHA_HEADER = 'X-BayState-Runner-Build-Sha';
export const RUNNER_RELEASE_CHANNEL_HEADER = 'X-BayState-Runner-Release-Channel';
export const RUNNER_BUILD_STATUS_HEADER = 'X-BayState-Runner-Build-Status';
export const LATEST_RUNNER_BUILD_ID_HEADER = 'X-BayState-Latest-Runner-Build-Id';
export const LATEST_RUNNER_BUILD_SHA_HEADER = 'X-BayState-Latest-Runner-Build-Sha';

const DEFAULT_RUNNER_RELEASE_CHANNEL = 'latest';
const RELEASE_SETTING_PREFIX = 'scraper_runner_release_';

export interface PublishedRunnerRelease {
    channel: string;
    buildId: string;
    buildSha: string | null;
    image: string | null;
    digest: string | null;
    publishedAt: string | null;
    refName: string | null;
    sourceRef: string | null;
}

export type RunnerBuildStatus = 'current' | 'missing' | 'outdated' | 'unconfigured';

export interface RunnerBuildCheck {
    releaseChannel: string;
    runnerBuildId: string | null;
    runnerBuildSha: string | null;
    expectedRelease: PublishedRunnerRelease | null;
    status: RunnerBuildStatus;
    isCompatible: boolean;
    isEnforced: boolean;
    message: string;
}

function normalizeReleaseChannel(value: string | null | undefined): string {
    const trimmed = value?.trim().toLowerCase() ?? '';
    if (!trimmed) {
        return DEFAULT_RUNNER_RELEASE_CHANNEL;
    }

    const normalized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || DEFAULT_RUNNER_RELEASE_CHANNEL;
}

function releaseSettingKey(channel: string): string {
    return `${RELEASE_SETTING_PREFIX}${channel}`;
}

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parsePublishedRunnerRelease(
    value: unknown,
    channel: string
): PublishedRunnerRelease | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const buildId = readString(record.build_id);
    if (!buildId) {
        return null;
    }

    return {
        channel,
        buildId,
        buildSha: readString(record.build_sha),
        image: readString(record.image),
        digest: readString(record.digest),
        publishedAt: readString(record.published_at),
        refName: readString(record.ref_name),
        sourceRef: readString(record.source_ref),
    };
}

export function getRunnerReleaseChannel(
    headers: { get(name: string): string | null }
): string {
    return normalizeReleaseChannel(headers.get(RUNNER_RELEASE_CHANNEL_HEADER));
}

export async function loadExpectedRunnerRelease(
    supabase: SupabaseClient,
    headers: { get(name: string): string | null }
): Promise<PublishedRunnerRelease | null> {
    const releaseChannel = getRunnerReleaseChannel(headers);
    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', releaseSettingKey(releaseChannel))
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to load runner release metadata: ${error.message}`);
    }

    return parsePublishedRunnerRelease(data?.value, releaseChannel);
}

export function getRunnerBuildCheck(
    headers: { get(name: string): string | null },
    expectedRelease: PublishedRunnerRelease | null
): RunnerBuildCheck {
    const releaseChannel = getRunnerReleaseChannel(headers);
    const runnerBuildId = readString(headers.get(RUNNER_BUILD_ID_HEADER));
    const runnerBuildSha = readString(headers.get(RUNNER_BUILD_SHA_HEADER));

    if (!expectedRelease) {
        return {
            releaseChannel,
            runnerBuildId,
            runnerBuildSha,
            expectedRelease: null,
            status: 'unconfigured',
            isCompatible: true,
            isEnforced: false,
            message: `Coordinator has no published runner release metadata for channel "${releaseChannel}" yet.`,
        };
    }

    if (!runnerBuildId) {
        return {
            releaseChannel,
            runnerBuildId: null,
            runnerBuildSha,
            expectedRelease,
            status: 'missing',
            isCompatible: false,
            isEnforced: true,
            message: `Runner build header ${RUNNER_BUILD_ID_HEADER} is required. Update this runner to the latest "${releaseChannel}" image.`,
        };
    }

    if (runnerBuildId !== expectedRelease.buildId) {
        return {
            releaseChannel,
            runnerBuildId,
            runnerBuildSha,
            expectedRelease,
            status: 'outdated',
            isCompatible: false,
            isEnforced: true,
            message: `Runner build ${runnerBuildId} does not match the latest published "${releaseChannel}" image build ${expectedRelease.buildId}. Pull the latest image and restart the runner.`,
        };
    }

    return {
        releaseChannel,
        runnerBuildId,
        runnerBuildSha,
        expectedRelease,
        status: 'current',
        isCompatible: true,
        isEnforced: true,
        message: `Runner build ${runnerBuildId} matches the latest "${releaseChannel}" image.`,
    };
}

export function buildRunnerBuildHeaders(check: RunnerBuildCheck): Record<string, string> {
    const headers: Record<string, string> = {
        [RUNNER_RELEASE_CHANNEL_HEADER]: check.releaseChannel,
        [RUNNER_BUILD_STATUS_HEADER]: check.status,
    };

    if (check.runnerBuildId) {
        headers[RUNNER_BUILD_ID_HEADER] = check.runnerBuildId;
    }

    if (check.runnerBuildSha) {
        headers[RUNNER_BUILD_SHA_HEADER] = check.runnerBuildSha;
    }

    if (check.expectedRelease?.buildId) {
        headers[LATEST_RUNNER_BUILD_ID_HEADER] = check.expectedRelease.buildId;
    }

    if (check.expectedRelease?.buildSha) {
        headers[LATEST_RUNNER_BUILD_SHA_HEADER] = check.expectedRelease.buildSha;
    }

    return headers;
}

export function buildRunnerBuildMetadata(
    existingMetadata: Record<string, unknown> | null | undefined,
    check: RunnerBuildCheck,
    checkedAt: string
): Record<string, unknown> {
    const priorMetadata =
        existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {};

    return {
        ...priorMetadata,
        version: check.runnerBuildSha ?? check.runnerBuildId ?? priorMetadata.version ?? null,
        build_id: check.runnerBuildId,
        build_sha: check.runnerBuildSha,
        release_channel: check.releaseChannel,
        latest_build_id: check.expectedRelease?.buildId ?? null,
        latest_build_sha: check.expectedRelease?.buildSha ?? null,
        build_compatible: check.isCompatible,
        build_check_reason: check.status,
        build_last_checked_at: checkedAt,
    };
}

export function createRunnerBuildMismatchResponse(
    check: RunnerBuildCheck,
    extraHeaders?: Record<string, string>
): NextResponse {
    return NextResponse.json(
        {
            error: 'Runner image update required',
            message: check.message,
            reason: check.status,
            release_channel: check.releaseChannel,
            runner_build_id: check.runnerBuildId,
            runner_build_sha: check.runnerBuildSha,
            latest_build_id: check.expectedRelease?.buildId ?? null,
            latest_build_sha: check.expectedRelease?.buildSha ?? null,
        },
        {
            status: 426,
            headers: {
                ...buildRunnerBuildHeaders(check),
                ...extraHeaders,
            },
        }
    );
}
