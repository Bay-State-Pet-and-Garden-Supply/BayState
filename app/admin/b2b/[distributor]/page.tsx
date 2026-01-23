import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Settings, Database, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CredentialForm } from '@/components/admin/b2b/credential-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCredentialStatus, testConnection } from '@/lib/b2b/credential-actions';
import { getB2BFeeds, getSyncJobs } from '@/lib/b2b/sync-service';

const DISTRIBUTOR_INFO: Record<string, { name: string; description: string }> = {
  PHILLIPS: {
    name: 'Phillips Pet',
    description: 'REST API connection to Endless Aisles platform',
  },
  ORGILL: {
    name: 'Orgill',
    description: 'SFTP fixed-width file feed (HD1 format)',
  },
  BCI: {
    name: 'BCI (OrderCloud)',
    description: 'OrderCloud OAuth2 API connection',
  },
  CENTRAL: {
    name: 'Central Pet',
    description: 'EDI VAN connection (placeholder)',
  },
  PFX: {
    name: 'Pet Food Experts',
    description: 'SFTP CSV file feed',
  },
};

interface PageProps {
  params: Promise<{ distributor: string }>;
}

async function getDistributorData(distributorCode: string) {
  const code = distributorCode.toUpperCase();
  
  if (!['PHILLIPS', 'ORGILL', 'BCI', 'CENTRAL', 'PFX'].includes(code)) {
    return null;
  }

  const [feeds, credentialStatus] = await Promise.all([
    getB2BFeeds(),
    getCredentialStatus(code),
  ]);

  const feed = feeds.find((f) => f.distributor_code === code);
  const jobs = await getSyncJobs(feed?.id, 5);

  return {
    code,
    info: DISTRIBUTOR_INFO[code],
    credentialStatus,
    feed,
    recentJobs: jobs,
  };
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  const distributor = resolvedParams.distributor.toUpperCase();
  const info = DISTRIBUTOR_INFO[distributor];
  
  if (!info) {
    return {
      title: 'Invalid Distributor',
    };
  }

  return {
    title: `${info.name} Credentials | Admin`,
    description: `Configure credentials for ${info.name} B2B feed`,
  };
}

export default async function CredentialPage({ params }: PageProps) {
  const resolvedParams = await params;
  const distributorCode = resolvedParams.distributor.toUpperCase();
  const data = await getDistributorData(distributorCode);

  if (!data) {
    notFound();
  }

  const { code, info, credentialStatus, feed, recentJobs } = data;

  return (
    <div className="space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/b2b">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to B2B
          </Link>
        </Button>
        <div className="h-px bg-gray-300 w-8" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#008850]/10">
            <Database className="h-5 w-5 text-[#008850]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{info.name}</h1>
            <p className="text-sm text-gray-600">{info.description}</p>
          </div>
        </div>
        <Badge variant={credentialStatus.configured ? 'default' : 'secondary'}>
          {credentialStatus.configured ? 'Configured' : 'Not Configured'}
        </Badge>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Credential Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {credentialStatus.configured ? (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-green-600">Configured</div>
                <div className="text-sm text-muted-foreground">
                  {credentialStatus.fields.filter((f) => f.required && f.configured).length} of{' '}
                  {credentialStatus.fields.filter((f) => f.required).length} required fields set
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold text-yellow-600">Not Configured</div>
                <div className="text-sm text-muted-foreground">
                  Configure credentials to enable syncing
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
          </CardHeader>
          <CardContent>
            {feed ? (
              <div className="space-y-2">
                <div className="text-2xl font-bold">
                  {feed.status === 'healthy' ? 'Healthy' : feed.status === 'degraded' ? 'Degraded' : feed.status}
                </div>
                <div className="text-sm text-muted-foreground">
                  {feed.products_count.toLocaleString()} products
                </div>
                {feed.last_sync_at && (
                  <div className="text-xs text-muted-foreground">
                    Last sync: {new Date(feed.last_sync_at).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-2xl font-bold text-gray-400">No Feed</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm">
                  {recentJobs[0].status === 'completed' ? (
                    <span className="text-green-600">Last sync successful</span>
                  ) : recentJobs[0].status === 'failed' ? (
                    <span className="text-red-600">Last sync failed</span>
                  ) : (
                    <span className="text-blue-600">Sync in progress</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {recentJobs[0].started_at && 
                    new Date(recentJobs[0].started_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="text-2xl font-bold text-gray-400">No activity</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Missing Fields Warning */}
      {credentialStatus.configured && credentialStatus.fields.some((f) => f.required && !f.configured) && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-yellow-800">Missing Required Credentials</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  The following required fields are not configured:
                </p>
                <ul className="list-disc list-inside text-sm text-yellow-700 mt-2">
                  {credentialStatus.fields
                    .filter((f) => f.required && !f.configured)
                    .map((f) => (
                      <li key={f.name}>{f.name}</li>
                    ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credential Form */}
      <CredentialForm
        distributorCode={code}
        distributorName={info.name}
        initialCredentials={credentialStatus.configured ? {} : {}}
      />
    </div>
  );
}

// Simple AlertTriangle icon component since we can't import from lucide-react
function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
