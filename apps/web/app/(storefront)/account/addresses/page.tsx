import { getAddresses } from '@/lib/account/data'
import { AddressList } from '@/components/account/address-list'

export const metadata = {
    title: 'Addresses',
    description: 'Manage your shipping addresses.'
}

export default async function AddressesPage() {
    const addresses = await getAddresses()

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Addresses</h2>
                <p className="text-muted-foreground">Manage your shipping and billing locations.</p>
            </div>

            <AddressList initialAddresses={addresses} />
        </div>
    )
}
