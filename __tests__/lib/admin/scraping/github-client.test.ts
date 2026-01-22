import { GitHubClient } from '@/lib/admin/scraping/github-client';

// Mock octokit
jest.mock('octokit', () => ({
    App: jest.fn().mockImplementation(() => ({
        getInstallationOctokit: jest.fn().mockResolvedValue({
            rest: {
                actions: {
                    listSelfHostedRunnersForRepo: jest.fn()
                }
            }
        })
    })),
    Octokit: jest.fn()
}));

// Setup env vars
process.env.GITHUB_APP_ID = '123';
process.env.GITHUB_APP_PRIVATE_KEY = 'private-key';
process.env.GITHUB_APP_INSTALLATION_ID = '456';
process.env.GITHUB_OWNER = 'owner';
process.env.GITHUB_REPO = 'repo';

describe('GitHubClient', () => {
    let client: GitHubClient;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new GitHubClient();
    });

    it('should throw descriptive error on 403 Resource not accessible', async () => {
        const mockOctokit = await (client as any).getOctokit();
        mockOctokit.rest.actions.listSelfHostedRunnersForRepo.mockRejectedValue({
            status: 403,
            message: 'Resource not accessible by integration'
        });

        await expect(client.getRunners()).rejects.toThrow(
            "Missing 'Administration' permission. Please update the GitHub App permissions to allow 'Administration: Read-only' access."
        );
    });

    it('should rethrow other errors', async () => {
        const mockOctokit = await (client as any).getOctokit();
        mockOctokit.rest.actions.listSelfHostedRunnersForRepo.mockRejectedValue(new Error('Other error'));

        await expect(client.getRunners()).rejects.toThrow('Other error');
    });
});
