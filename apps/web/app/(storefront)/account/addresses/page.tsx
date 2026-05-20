import { getAddresses } from '@/lib/account/data'
import { AddressList } from '@/components/account/address-list'

export const metadata = {
    title: 'Addresses',
    description: 'Manage your shipping addresses.'
}

export default async function AddressesPage() {
    const addresses = await getAddresses()

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Addresses</h1>
                <p className="text-zinc-500 font-body mt-1">Manage your shipping and billing locations for faster checkout.</p>
            </div>

            <AddressList initialAddresses={addresses} />
        </div>
    )
}
