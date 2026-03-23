'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Copy, Check } from 'lucide-react';
import { RunnerAccountModal } from '@/components/admin/scraper-network/runner-account-modal';

interface CodeBlockProps {
    code: string;
    id: string;
    copied: string | null;
    onCopy: (text: string, id: string) => void;
}

function CodeBlock({ code, id, copied, onCopy }: CodeBlockProps) {
    return (
        <div className="relative mt-2 rounded-lg bg-gray-900 p-3">
            <button
                onClick={() => onCopy(code, id)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-gray-800 hover:text-white"
            >
                {copied === id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            <pre className="overflow-x-auto text-sm text-green-400">
                <code>{code}</code>
            </pre>
        </div>
    );
}

export function SetupGuide() {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [showCreateRunnerModal, setShowCreateRunnerModal] = useState(false);

    const installCommand = `curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash`;

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="rounded-lg border border-border bg-card">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-foreground">Runner Setup Guide</span>
                </div>
                {isOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
            </button>

            {isOpen && (
                <div className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
                    <div className="space-y-6">
                        <section>
                            <h4 className="font-semibold text-foreground">1. Prerequisites</h4>
                            <ul className="mt-2 list-inside list-disc space-y-1">
                                <li>Docker installed and running</li>
                                <li>Admin access to generate an API key</li>
                            </ul>
                        </section>

                        <section>
                            <h4 className="font-semibold text-foreground">2. Generate an API Key</h4>
                            <p className="mt-1">
                                Scroll up to the <strong>Runner Accounts</strong> section on this page.
                            </p>
                            <ul className="mt-2 list-inside list-disc space-y-1">
                                <li>
                                    Click{' '}
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateRunnerModal(true)}
                                        className="font-semibold text-green-700 underline underline-offset-2 hover:text-green-800"
                                    >
                                        Create Runner
                                    </button>
                                </li>
                                <li>Enter a unique runner name (e.g. <code className="bg-muted px-1 rounded">my-server-1</code>)</li>
                                <li>Copy the generated <strong>API Key</strong> (starts with <code className="bg-muted px-1 rounded">bsr_</code>)</li>
                            </ul>
                            <p className="mt-2 text-amber-600 font-medium italic">
                                Note: API keys are only displayed once. If lost, you must revoke and create a new key.
                            </p>
                        </section>

                        <section>
                            <h4 className="font-semibold text-foreground">3. Automatic Install (Recommended)</h4>
                            <p className="mt-1">
                                Paste one command into your terminal (macOS/Linux). The installer deploys the scraper runner in Docker and starts a setup wizard.
                            </p>
                            <CodeBlock
                                code={installCommand}
                                id="curl-install"
                                copied={copied}
                                onCopy={copyToClipboard}
                            />
                            <p className="mt-2 text-muted-foreground">
                                The wizard asks for your app URL, prompts you to open this page to generate a key, then asks you to paste the key.
                            </p>
                            <p className="mt-2 text-muted-foreground">
                                Optional: enable hourly auto-updates directly from GitHub Packages during setup.
                            </p>
                        </section>

                        <section>
                            <h4 className="font-semibold text-foreground">4. Required Environment Variables</h4>
                            <p className="mt-1">For manual Docker or CI setups, provide these values:</p>
                            <div className="mt-2 rounded-lg bg-muted p-3 font-mono text-xs">
                                <div className="grid grid-cols-[1fr,2fr] gap-2">
                                    <div className="font-semibold text-muted-foreground">SCRAPER_API_URL</div>
                                    <div className="text-muted-foreground">BayStateApp URL (e.g. https://app.baystatepet.com)</div>

                                    <div className="font-semibold text-muted-foreground">SCRAPER_API_KEY</div>
                                    <div className="text-muted-foreground">Your bsr_... key</div>

                                    <div className="font-semibold text-muted-foreground">RUNNER_NAME</div>
                                    <div className="text-muted-foreground">Unique identifier for this runner</div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="font-semibold text-foreground">5. Desktop App (Development)</h4>
                            <p className="mt-1">
                                To run the scraper with a visual interface for debugging:
                            </p>
                            <p>
                                Ensure the runner API key matches what you see in the Runner Accounts table.
                            </p>
                            <p>
                                If using Docker: &quot;runner_id&quot; in <code>docker-compose.yml</code> must verify against the ID in Runner Accounts.
                            </p>
                            <CodeBlock
                                code={`git clone https://github.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper.git
cd BayStateScraper/ui && npm install
cd ../src-tauri && cargo tauri dev`}
                                id="desktop-dev"
                                copied={copied}
                                onCopy={copyToClipboard}
                            />
                        </section>

                        <section>
                            <h4 className="font-semibold text-foreground">6. Verify Connection</h4>
                            <p className="mt-1">
                                Once the installer completes or the Docker container starts, the runner will appear in the <strong>Connected Runners</strong> grid above with a green &quot;Ready&quot; status.
                            </p>
                        </section>
                    </div>
                </div>
            )}

            {showCreateRunnerModal && (
                <RunnerAccountModal
                    onClose={() => setShowCreateRunnerModal(false)}
                    onSave={() => {
                        setShowCreateRunnerModal(false);
                    }}
                />
            )}
        </div>
    );
}
