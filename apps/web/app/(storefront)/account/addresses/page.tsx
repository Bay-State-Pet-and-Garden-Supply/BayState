import { getAddresses } from '@/lib/account/data'
import { AddressList } from '@/components/account/address-list'

export const metadata = {
    title: 'Addresses',
    description: 'Manage your shipping addresses.'
}

export default async function AddressesPage() {
    const addresses = await getAddresses()

    return (
        <div className="space-y-12">
            <div className="border-b-8 border-zinc-900 pb-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">Addresses</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">Manage your shipping and billing locations for faster checkout.</p>
            </div>

            <AddressList initialAddresses={addresses} />
        </div>
    )
}

