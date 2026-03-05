'use server';

export async function pullFromGitHub(
  scraperId: string,
  repoUrl: string,
  branch: string,
  filePath: string
): Promise<{ success: boolean; error?: string; content?: string }> {
  return { success: true, content: '' };
}

export async function pushToGitHub(
  scraperId: string,
  repoUrl: string,
  branch: string,
  filePath: string,
  content: string,
  commitMessage: string
): Promise<{ success: boolean; error?: string; commitUrl?: string }> {
  return { success: true };
}

export async function getGitHubSyncStatus(
  scraperId: string
): Promise<{
  configured: boolean;
  repoUrl?: string;
  branch?: string;
  filePath?: string;
  lastSyncAt?: string | null;
}> {
  return {
    configured: false,
  };
}
