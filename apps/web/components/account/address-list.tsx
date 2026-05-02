'use client'

import { useState } from 'react'
import { Address } from '@/lib/account/types'
import { AddressForm } from './address-form'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, CheckCircle, MapPin } from 'lucide-react'
import { deleteAddressAction, setDefaultAddressAction } from '@/lib/account/actions'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export function AddressList({ initialAddresses }: { initialAddresses: Address[] }) {
    const [isAdding, setIsAdding] = useState(false)

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this address?')) return
        await deleteAddressAction(id)
    }

    async function handleSetDefault(id: string) {
        await setDefaultAddressAction(id)
    }

    return (
        <div className="space-y-8">
            {!isAdding && (
                <Button onClick={() => setIsAdding(true)} className="h-14 px-8 text-lg font-semibold tracking-wide bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]">
                    <Plus className="mr-2 h-6 w-6" /> Add New Address
                </Button>
            )}

            {isAdding && (
                <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-md overflow-hidden rounded-sm">
                    <div className="bg-primary p-4 border-b border-[oklch(85%_0.03_160)] text-primary-foreground flex justify-between items-center">
                        <div className="flex flex-col">
                            <h3 className="text-2xl font-bold tracking-tight font-display">New Address</h3>
                            <p className="text-xs font-medium tracking-wide text-primary-foreground/80">Add a location for your deliveries.</p>
                        </div>
                        <Button variant="ghost" onClick={() => setIsAdding(false)} className="h-10 px-4 text-xs font-medium tracking-wide text-white hover:bg-white/10 rounded-sm">Cancel</Button>
                    </div>
                    <div className="p-8">
                        <AddressForm onSuccess={() => setIsAdding(false)} />
                    </div>
                </div>
            )}

            <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
                {initialAddresses.map(addr => (
                    <div key={addr.id} className={cn(
                        "border border-[oklch(85%_0.03_160)] bg-card flex flex-col transition-all rounded-sm",
                        addr.is_default ? "shadow-md ring-1 ring-[oklch(85%_0.03_160)]" : "shadow-sm hover:shadow-md"
                    )}>
                        <div className="p-6 relative flex-1">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 flex items-center text-[10px] font-medium tracking-wide text-white bg-[oklch(72%_0.14_85)] px-3 py-1.5 rounded-sm">
                                    <CheckCircle className="mr-1.5 h-3 w-3" /> Default
                                </div>
                            )}
                            <div className="font-bold text-2xl tracking-tight pr-24 font-display leading-tight">{addr.full_name}</div>
                            <div className="text-base font-medium text-muted-foreground mt-4 space-y-1">
                                <div>{addr.address_line1}</div>
                                {addr.address_line2 && <div>{addr.address_line2}</div>}
                                <div className="text-foreground">{addr.city}, {addr.state} {addr.zip_code}</div>
                                {addr.phone && <div className="mt-4 pt-4 border-t border-[oklch(90%_0.02_160)] text-xs font-medium tracking-wide text-muted-foreground">TEL: {addr.phone}</div>}
                            </div>
                        </div>

                        <div className="flex border-t border-[oklch(85%_0.03_160)] bg-muted">
                            {!addr.is_default && (
                                <button
                                    type="button"
                                    onClick={() => handleSetDefault(addr.id)}
                                    className="flex-1 py-4 text-xs font-medium tracking-wide text-muted-foreground hover:text-foreground hover:bg-muted/80 border-r border-[oklch(85%_0.03_160)] transition-colors"
                                >
                                    Set as Default
                                </button>
                            )}
                            <button
                                type="button"
                                aria-label={addr.is_default ? 'Delete address' : `Delete address for ${addr.full_name}`}
                                className={cn(
                                    "py-4 px-6 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors",
                                    addr.is_default ? "w-full text-center font-medium tracking-wide" : ""
                                )}
                                onClick={() => handleDelete(addr.id)}
                            >
                                <Trash2 className={cn("h-5 w-5 mx-auto", addr.is_default ? "inline mr-2" : "")} />
                                {addr.is_default && "Delete Address"}
                            </button>
                        </div>
                    </div>
                ))}

                {initialAddresses.length === 0 && !isAdding && (
                    <div className="col-span-full">
                        <EmptyState
                            icon={MapPin}
                            title="No addresses saved"
                            description="You haven't added any shipping addresses yet. Add a location to speed up your checkout process."
                            actionLabel="Add New Address"
                            onAction={() => setIsAdding(true)}
                        />
                    </div>
                )}
            </div>
        </div>
    )

}
