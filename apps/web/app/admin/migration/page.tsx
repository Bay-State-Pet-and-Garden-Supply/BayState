
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Database, RefreshCw } from 'lucide-react';
import { getCredentials, saveCredentialsAction, syncProductsFormAction, syncCustomersFormAction, syncOrdersFormAction } from './actions';
import { getRecentMigrationLogs } from '@/lib/admin/migration/history';
import { DownloadXmlButtons } from '@/components/admin/migration/download-xml-buttons';
import { MigrationHistory } from '@/components/admin/migration/migration-history';
import { SyncButton } from '@/components/admin/migration/sync-button';

export default async function AdminMigrationPage() {
    const credentials = await getCredentials();
    const hasCredentials = credentials !== null;
    const migrationLogs = await getRecentMigrationLogs(10);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Data Migration</h1>
                <p className="text-muted-foreground">
                    Sync products, customers, and orders from ShopSite
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Connection Status */}
                <Card className="h-full">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${hasCredentials ? 'bg-green-100' : 'bg-gray-100'}`}>
                                <Database className={`h-5 w-5 ${hasCredentials ? 'text-green-600' : 'text-gray-600'}`} />
                            </div>
                            <div className="flex-1">
                                <CardTitle>ShopSite Connection</CardTitle>
                                <CardDescription>
                                    Configure your ShopSite API credentials
                                </CardDescription>
                            </div>
                            <Badge variant={hasCredentials ? 'default' : 'secondary'}>
                                {hasCredentials ? 'Configured' : 'Not Configured'}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form action={saveCredentialsAction} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="storeUrl">ShopSite Store URL</Label>
                                <Input
                                    id="storeUrl"
                                    name="storeUrl"
                                    type="url"
                                    defaultValue={credentials?.storeUrl || ''}
                                    placeholder="https://yourstore.shopsite.com"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="merchantId">Merchant ID</Label>
                                <Input
                                    id="merchantId"
                                    name="merchantId"
                                    defaultValue={credentials?.merchantId || ''}
                                    placeholder="Your ShopSite Merchant ID"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">API Password</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    defaultValue={credentials?.password || ''}
                                    placeholder="Your ShopSite API password"
                                    required
                                />
                            </div>

                            <Button type="submit" className="w-full">
                                Save Credentials
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Sync Operations */}
                {hasCredentials ? (
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                                    <RefreshCw className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <CardTitle>Sync Operations</CardTitle>
                                    <CardDescription>
                                        Download and import data
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                <form action={syncProductsFormAction}>
                                    <SyncButton label="Sync Products" />
                                </form>
                                <form action={syncCustomersFormAction}>
                                    <SyncButton label="Sync Customers" />
                                </form>
                                <form action={syncOrdersFormAction}>
                                    <SyncButton label="Sync Orders" />
                                </form>
                            </div>

                            {/* Download XML Section */}
                            <div className="pt-4 border-t">
                                <DownloadXmlButtons />
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="h-full border-dashed flex items-center justify-center p-6 text-center text-muted-foreground">
                        <div className="space-y-2">
                            <Database className="h-8 w-8 mx-auto text-muted-foreground" />
                            <p>Configure connection to enable sync</p>
                        </div>
                    </Card>
                )}
            </div>

            {/* Migration History */}
            <div className="h-full">
                <MigrationHistory initialLogs={migrationLogs} />
            </div>
        </div>
    );
}
