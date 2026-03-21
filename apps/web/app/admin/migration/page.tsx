import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Github, Settings } from 'lucide-react';
import { getRecentMigrationLogs } from '@/lib/admin/migration/history';
import { MigrationHistory } from '@/components/admin/migration/migration-history';

export default async function AdminMigrationPage() {
    const migrationLogs = await getRecentMigrationLogs(10);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Data Migration</h1>
                <p className="text-muted-foreground">
                    This page is deprecated. ShopSite sync now runs through GitHub Actions on your local runner.
                </p>
            </div>

            <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                            <AlertTriangle className="h-5 w-5 text-amber-700" />
                        </div>
                        <div>
                            <CardTitle>Migration UI Deprecated</CardTitle>
                            <CardDescription>
                                Manage credentials in Settings and run sync from GitHub Actions.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <p>
                        The old in-page ShopSite sync is no longer supported. Large catalogs should be synced by
                        GitHub Actions on your local runner, which avoids request-size and execution limits.
                    </p>
                    <p>
                        ShopSite credentials now live in <code>/admin/settings</code>. The scheduled workflow reads those
                        credentials from <code>site_settings</code> and updates the storefront product and taxonomy tables.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                            <Link href="/admin/settings">
                                <Settings className="mr-2 h-4 w-4" />
                                Open Settings
                            </Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/actions/workflows/shopsite-sync.yml" target="_blank" rel="noreferrer">
                                <Github className="mr-2 h-4 w-4" />
                                Open Workflow
                                <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="rounded-md border bg-background p-3 font-mono text-xs text-foreground">
                        bun --cwd apps/web run sync:shopsite --limit=100
                    </div>
                </CardContent>
            </Card>

            <div className="h-full">
                <MigrationHistory initialLogs={migrationLogs} />
            </div>
        </div>
    );
}
