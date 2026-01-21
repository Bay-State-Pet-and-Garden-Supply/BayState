'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Copy, Check } from 'lucide-react';

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
                className="absolute right-2 top-2 rounded p-1 text-gray-600 hover:bg-gray-800 hover:text-white"
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

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-white">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Runner Setup Guide</span>
                </div>
                {isOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-600" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-gray-600" />
                )}
            </button>

            {isOpen && (
                <div className="border-t border-gray-200 px-4 py-4 text-sm text-gray-600">
                    <div className="space-y-6">
                        <section>
                            <h4 className="font-semibold text-gray-900">1. Prerequisites</h4>
                            <ul className="mt-2 list-inside list-disc space-y-1">
                                <li>Python 3.9 or higher</li>
                                <li>Docker installed (optional, but recommended)</li>
                                <li>Admin access to generate an API key</li>
                            </ul>
                        </section>

                        <section>
                            <h4 className="font-semibold text-gray-900">2. Generate an API Key</h4>
                            <p className="mt-1">
                                Scroll up to the <strong>Runner Accounts</strong> section on this page.
                            </p>
                            <ul className="mt-2 list-inside list-disc space-y-1">
                                <li>Click <strong>Create Runner</strong></li>
                                <li>Enter a unique runner name (e.g. <code className="bg-gray-100 px-1 rounded">my-server-1</code>)</li>
                                <li>Copy the generated <strong>API Key</strong> (starts with <code className="bg-gray-100 px-1 rounded">bsr_</code>)</li>
                            </ul>
                            <p className="mt-2 text-amber-600 font-medium italic">
                                Note: API keys are only displayed once. If lost, you must revoke and create a new key.
                            </p>
                        </section>

                        <section>
                            <h4 className="font-semibold text-gray-900">3. Automatic Install (Recommended)</h4>
                            <p className="mt-1">Run the new installer script on your machine (macOS/Linux). This handles Python setup, virtual environments, and configuration automatically.</p>
                            <CodeBlock
                                code={`curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper/main/install.sh | bash`}
                                id="curl-install"
                                copied={copied}
                                onCopy={copyToClipboard}
                            />
                            <p className="mt-2 text-gray-600">The interactive wizard will ask for your Runner Name and API Key.</p>
                        </section>

                        <section>
                            <h4 className="font-semibold text-gray-900">4. GitHub Actions / Docker Setup</h4>
                            <p className="mt-1">For headless CI/CD environments, configure these secrets in your repository or container:</p>
                            <div className="mt-2 rounded-lg bg-gray-50 p-3 font-mono text-xs">
                                <div className="grid grid-cols-[1fr,2fr] gap-2">
                                    <div className="font-semibold text-gray-700">SCRAPER_API_URL</div>
                                    <div className="text-gray-600">This app&apos;s URL (e.g. https://app.baystatepet.com)</div>

                                    <div className="font-semibold text-gray-700">SCRAPER_API_KEY</div>
                                    <div className="text-gray-600">Your bsr_... key</div>

                                    <div className="font-semibold text-gray-700">RUNNER_NAME</div>
                                    <div className="text-gray-600">Unique identifier for this runner</div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="font-semibold text-gray-900">5. Desktop App (Development)</h4>
                            <p className="mt-1">
                                To run the scraper with a visual interface for debugging:
                            </p>
                            <p>
                                Ensure the runner&apos;s API key matches what you see in the Runner Accounts table.
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
                            <h4 className="font-semibold text-gray-900">6. Verify Connection</h4>
                            <p className="mt-1">
                                Once the installer completes or the Docker container starts, the runner will appear in the <strong>Connected Runners</strong> grid above with a green &quot;Ready&quot; status.
                            </p>
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
