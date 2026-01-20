/**
 * GitHub API Client using GitHub App Authentication
 *
 * Uses a GitHub App for authentication instead of a Personal Access Token.
 * This is more secure and team-friendly as it doesn't rely on individual user credentials.
 * 
 * Required environment variables:
 * - GITHUB_APP_ID: The App ID from your GitHub App settings
 * - GITHUB_APP_INSTALLATION_ID: The installation ID (from URL after installing the app)
 * - GITHUB_APP_PRIVATE_KEY: The private key (PEM format) from your GitHub App
 * - GITHUB_OWNER: Repository owner
 * - GITHUB_REPO: Repository name
 */

import { App, Octokit } from 'octokit';

export interface GitHubRunner {
    id: number;
    name: string;
    os: string;
    status: string;
    busy: boolean;
    labels: Array<{ id?: number; name: string; type?: string }>;
}

export interface GitHubRunnersResponse {
    total_count: number;
    runners: GitHubRunner[];
}

export interface WorkflowRun {
    id: number;
    name: string;
    status: string | null;
    conclusion: string | null;
    html_url: string;
    created_at: string;
    updated_at: string;
}

export interface WorkflowRunsResponse {
    total_count: number;
    workflow_runs: WorkflowRun[];
}

export interface TriggerWorkflowInputs {
    job_id: string;
    skus?: string;
    scrapers?: string;
    test_mode?: boolean;
    max_workers?: number;
    /** 
     * Execution mode:
     * - 'full': Process all SKUs in single runner (legacy)
     * - 'chunk_worker': Claim and process chunks until none remain
     */
    mode?: 'full' | 'chunk_worker';
}

export interface RunnerStatus {
    available: boolean;
    onlineCount: number;
    offlineCount: number;
    totalCount: number;
    runners: GitHubRunner[];
}

class GitHubAppClient {
    private app: App | null = null;
    private octokit: Octokit | null = null;
    private readonly owner: string;
    private readonly repo: string;
    private readonly scraperRepo: string;
    private readonly installationId: number;

    constructor() {
        const appId = process.env.GITHUB_APP_ID;
        const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
        const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const scraperRepo = process.env.GITHUB_SCRAPER_REPO;

        if (!appId || !privateKey || !installationId || !owner || !repo) {
            throw new Error(
                'Missing GitHub App configuration. Required: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID, GITHUB_OWNER, GITHUB_REPO'
            );
        }

        // Handle private key formatting (may be base64 encoded or have escaped newlines)
        let formattedPrivateKey = privateKey;
        if (!privateKey.includes('-----BEGIN')) {
            // Assume base64 encoded
            formattedPrivateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
        }
        // Replace escaped newlines
        formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');

        this.app = new App({
            appId,
            privateKey: formattedPrivateKey,
        });

        this.owner = owner;
        this.repo = repo;
        this.scraperRepo = scraperRepo || repo; // Default to main repo if not set
        this.installationId = parseInt(installationId, 10);
    }

    /**
     * Get an authenticated Octokit instance for API calls
     */
    private async getOctokit(): Promise<Octokit> {
        if (!this.octokit && this.app) {
            this.octokit = await this.app.getInstallationOctokit(this.installationId);
        }
        if (!this.octokit) {
            throw new Error('Failed to initialize Octokit');
        }
        return this.octokit;
    }

    /**
     * Get all self-hosted runners for the repository
     */
    async getRunners(): Promise<GitHubRunnersResponse> {
        const octokit = await this.getOctokit();
        try {
            const response = await octokit.rest.actions.listSelfHostedRunnersForRepo({
                owner: this.owner,
                repo: this.scraperRepo,
            });

            return {
                total_count: response.data.total_count,
                runners: response.data.runners.map((runner) => ({
                    id: runner.id,
                    name: runner.name,
                    os: runner.os,
                    status: runner.status,
                    busy: runner.busy,
                    labels: runner.labels.map((label) => ({
                        id: label.id,
                        name: label.name,
                        type: label.type,
                    })),
                })),
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error.status === 403 && error.message.includes('Resource not accessible by integration')) {
                throw new Error(
                    "Missing 'Administration' permission. Please update the GitHub App permissions to allow 'Administration: Read-only' access."
                );
            }
            throw error;
        }
    }

    /**
     * Get runner availability status
     */
    async getRunnerStatus(): Promise<RunnerStatus> {
        const response = await this.getRunners();

        const onlineRunners = response.runners.filter((r) => r.status === 'online');
        const offlineRunners = response.runners.filter((r) => r.status === 'offline');

        return {
            available: onlineRunners.length > 0,
            onlineCount: onlineRunners.length,
            offlineCount: offlineRunners.length,
            totalCount: response.total_count,
            runners: response.runners,
        };
    }

    /**
     * Check if at least one runner is available
     */
    async hasAvailableRunners(): Promise<boolean> {
        const status = await this.getRunnerStatus();
        return status.available;
    }

    /**
     * Trigger the scraping workflow
     */
    async triggerWorkflow(inputs: TriggerWorkflowInputs): Promise<void> {
        const octokit = await this.getOctokit();
        await octokit.rest.actions.createWorkflowDispatch({
            owner: this.owner,
            repo: this.scraperRepo,
            workflow_id: 'scrape.yml',
            ref: 'main',
            inputs: {
                job_id: inputs.job_id,
                skus: inputs.skus || '',
                scrapers: inputs.scrapers || '',
                test_mode: String(inputs.test_mode || false),
                max_workers: String(inputs.max_workers || 3),
                mode: inputs.mode || 'full',
            },
        });
    }

    /**
     * Get a specific workflow run
     */
    async getWorkflowRun(runId: number): Promise<WorkflowRun> {
        const octokit = await this.getOctokit();
        const response = await octokit.rest.actions.getWorkflowRun({
            owner: this.owner,
            repo: this.scraperRepo,
            run_id: runId,
        });

        return {
            id: response.data.id,
            name: response.data.name || '',
            status: response.data.status as WorkflowRun['status'],
            conclusion: response.data.conclusion as WorkflowRun['conclusion'],
            html_url: response.data.html_url,
            created_at: response.data.created_at,
            updated_at: response.data.updated_at,
        };
    }

    /**
     * Get recent workflow runs for the scrape workflow
     */
    async getWorkflowRuns(limit = 10): Promise<WorkflowRunsResponse> {
        const octokit = await this.getOctokit();
        const response = await octokit.rest.actions.listWorkflowRuns({
            owner: this.owner,
            repo: this.scraperRepo,
            workflow_id: 'scrape.yml',
            per_page: limit,
        });

        return {
            total_count: response.data.total_count,
            workflow_runs: response.data.workflow_runs.map((run) => ({
                id: run.id,
                name: run.name || '',
                status: run.status,
                conclusion: run.conclusion,
                html_url: run.html_url,
                created_at: run.created_at,
                updated_at: run.updated_at,
            })),
        };
    }
}

// Export singleton instance getter
let clientInstance: GitHubAppClient | null = null;

export function getGitHubClient(): GitHubAppClient {
    if (!clientInstance) {
        clientInstance = new GitHubAppClient();
    }
    return clientInstance;
}

// Export class for testing
export { GitHubAppClient as GitHubClient };
