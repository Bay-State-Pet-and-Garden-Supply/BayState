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
            <div className="border-b border-[oklch(85%_0.03_160)] pb-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight font-display leading-none text-foreground">Addresses</h1>
                <p className="text-muted-foreground font-medium tracking-wide text-sm mt-2">Manage your shipping and billing locations for faster checkout.</p>
            </div>

            <AddressList initialAddresses={addresses} />
        </div>
    )
}
