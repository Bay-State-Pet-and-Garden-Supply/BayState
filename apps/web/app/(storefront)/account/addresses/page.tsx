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
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Delivery</p>
                <h1 className="storefront-section-title">Addresses</h1>
                <p className="storefront-section-copy mt-3">Manage your shipping and billing locations for faster checkout.</p>
            </div>

            <AddressList initialAddresses={addresses} />
        </div>
    )
}
