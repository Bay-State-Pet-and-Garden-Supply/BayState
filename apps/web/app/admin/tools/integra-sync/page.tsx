import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { SyncClient } from './SyncClient';
import { Database } from 'lucide-react';

export const metadata = {
    title: 'Integra Register Sync',
    description: 'Sync products from the Integra register system to the website onboarding pipeline.',
};

export default function IntegraSyncPage() {
    return (
        <AdminPageShell
            title="Integra Register Sync"
            description="Compare store register data with website catalog to identify new products."
            icon={<Database className="h-5 w-5" />}
        >
            <SyncClient />
        </AdminPageShell>
    );
}
