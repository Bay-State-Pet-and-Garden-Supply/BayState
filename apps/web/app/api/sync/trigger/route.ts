import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route to trigger GitHub Action workflows.
 * This allows for manual syncs and scraper runs from the admin panel.
 */
export async function POST(request: NextRequest) {
    try {
        // Repository details from environment variables
        const owner = process.env.GITHUB_OWNER || 'Bay-State-Pet-and-Garden-Supply';
        const repo = process.env.GITHUB_REPO || 'BayStateApp';
        
        // Prefer GITHUB_TOKEN if available
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

        if (!token) {
            console.error('[Sync API] Missing GITHUB_TOKEN environment variable');
            return NextResponse.json(
                { error: 'GitHub configuration missing' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { workflow = 'register-sync.yml', inputs = {} } = body;

        // Trigger the workflow via GitHub REST API
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                body: JSON.stringify({
                    ref: 'main', // Default to main branch
                    inputs: inputs
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Sync API] GitHub API error (${response.status}):`, errorText);
            return NextResponse.json(
                { 
                    error: `Failed to trigger GitHub Action: ${workflow}`, 
                    status: response.status,
                    details: errorText 
                },
                { status: response.status }
            );
        }

        return NextResponse.json({ 
            success: true, 
            message: `Workflow ${workflow} triggered successfully` 
        });

    } catch (error) {
        console.error('[Sync API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
