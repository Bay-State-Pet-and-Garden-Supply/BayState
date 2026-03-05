import { SyncClient } from './SyncClient';
import { Database } from 'lucide-react';

export const metadata = {
    title: 'Integra Register Sync',
    description: 'Sync products from the Integra register system to the website onboarding pipeline.',
};

export default function IntegraSyncPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8 flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                    <Database className="h-8 w-8 text-orange-600" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">Integra Register Sync</h1>
                    <p className="text-gray-600">
                        Compare store register data with website catalog to identify new products.
                    </p>
                </div>
            </div>

            <SyncClient />
        </div>
    );
}
