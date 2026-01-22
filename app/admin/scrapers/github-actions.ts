'use server';

import { createClient } from '@/lib/supabase/server';

interface GitHubFileResponse {
  content: string;
  sha: string;
  name: string;
  path: string;
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

export async function pullFromGitHub(
  scraperId: string,
  repoUrl: string,
  branch: string,
  filePath: string
): Promise<{ success: boolean; content?: string; sha?: string; error?: string }> {
  try {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid repository URL' };
    }

    const supabase = await createClient();
    
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'github_token')
      .single();

    const token = settings?.value as string | undefined;
    if (!token) {
      return { success: false, error: 'GitHub token not configured. Add it in Settings.' };
    }

    const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}?ref=${branch}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'BayStateApp',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'File not found in repository' };
      }
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || `GitHub API error: ${response.status}` };
    }

    const data: GitHubFileResponse = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    return { success: true, content, sha: data.sha };
  } catch (error) {
    console.error('[GitHub Pull] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to pull from GitHub' };
  }
}

export async function pushToGitHub(
  scraperId: string,
  repoUrl: string,
  branch: string,
  filePath: string,
  content: string,
  message?: string
): Promise<{ success: boolean; commitUrl?: string; error?: string }> {
  try {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid repository URL' };
    }

    const supabase = await createClient();
    
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'github_token')
      .single();

    const token = settings?.value as string | undefined;
    if (!token) {
      return { success: false, error: 'GitHub token not configured. Add it in Settings.' };
    }

    const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}`;
    
    let existingSha: string | undefined;
    const getResponse = await fetch(`${apiUrl}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'BayStateApp',
      },
    });

    if (getResponse.ok) {
      const existingFile = await getResponse.json();
      existingSha = existingFile.sha;
    }

    const commitMessage = message || `Update ${filePath} from BayStateApp`;
    const encodedContent = Buffer.from(content).toString('base64');

    const putBody: Record<string, string> = {
      message: commitMessage,
      content: encodedContent,
      branch,
    };

    if (existingSha) {
      putBody.sha = existingSha;
    }

    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'BayStateApp',
      },
      body: JSON.stringify(putBody),
    });

    if (!putResponse.ok) {
      const errorData = await putResponse.json().catch(() => ({}));
      return { success: false, error: errorData.message || `GitHub API error: ${putResponse.status}` };
    }

    const result = await putResponse.json();
    const commitUrl = result.commit?.html_url;

    await supabase
      .from('scrapers')
      .update({
        github_sync: {
          repo_url: repoUrl,
          branch,
          file_path: filePath,
          last_sync_at: new Date().toISOString(),
          last_commit_sha: result.content?.sha,
        },
      })
      .eq('id', scraperId);

    return { success: true, commitUrl };
  } catch (error) {
    console.error('[GitHub Push] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to push to GitHub' };
  }
}

export async function getGitHubSyncStatus(
  scraperId: string
): Promise<{ configured: boolean; lastSyncAt?: string; repoUrl?: string; branch?: string; filePath?: string }> {
  try {
    const supabase = await createClient();
    
    const { data: scraper } = await supabase
      .from('scrapers')
      .select('github_sync')
      .eq('id', scraperId)
      .single();

    const sync = scraper?.github_sync as {
      repo_url?: string;
      branch?: string;
      file_path?: string;
      last_sync_at?: string;
    } | null;

    if (!sync || !sync.repo_url) {
      return { configured: false };
    }

    return {
      configured: true,
      lastSyncAt: sync.last_sync_at,
      repoUrl: sync.repo_url,
      branch: sync.branch,
      filePath: sync.file_path,
    };
  } catch {
    return { configured: false };
  }
}
