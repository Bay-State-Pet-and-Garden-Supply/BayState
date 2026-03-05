'use client'

import { useState } from 'react'
import { Address } from '@/lib/account/types'
import { AddressForm } from './address-form'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, CheckCircle, MapPin } from 'lucide-react'
import { deleteAddressAction, setDefaultAddressAction } from '@/lib/account/actions'
import { Card, CardContent } from '@/components/ui/card'
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
        <div className="space-y-6">
            {!isAdding && (
                <Button onClick={() => setIsAdding(true)} className="h-11 text-base">
                    <Plus className="mr-2 h-5 w-5" /> Add New Address
                </Button>
            )}

            {isAdding && (
                <Card className="border-zinc-200">
                    <CardContent className="pt-6">
                        <div className="flex justify-between mb-4 items-center">
                            <h3 className="font-semibold text-lg">New Address</h3>
                            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="h-11 px-4 text-base">Cancel</Button>
                        </div>
                        <AddressForm onSuccess={() => setIsAdding(false)} />
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {initialAddresses.map(addr => (
                    <Card key={addr.id} className={addr.is_default ? "border-zinc-900 ring-1 ring-zinc-900" : ""}>
                        <CardContent className="pt-6 relative">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 flex items-center text-xs font-medium text-zinc-900 bg-zinc-100 px-2 py-1 rounded-full">
                                    <CheckCircle className="mr-1 h-3 w-3" /> Default
                                </div>
                            )}
                            <div className="font-semibold pr-20 text-lg">{addr.full_name}</div>
                            <div className="text-base text-zinc-600 mt-2 space-y-0.5">
                                <div>{addr.address_line1}</div>
                                {addr.address_line2 && <div>{addr.address_line2}</div>}
                                <div>{addr.city}, {addr.state} {addr.zip_code}</div>
                                {addr.phone && <div className="mt-2 text-zinc-500">{addr.phone}</div>}
                            </div>

                            <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-100">
                                {!addr.is_default && (
                                    <Button variant="ghost" size="sm" onClick={() => handleSetDefault(addr.id)} className="h-11 px-4 text-sm font-medium">
                                        Set Default
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" className="ml-auto h-11 px-4 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDelete(addr.id)}>
                                    <Trash2 className="h-5 w-5" />
                                    <span className="sr-only">Delete</span>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {initialAddresses.length === 0 && !isAdding && (
                    <EmptyState
                        icon={MapPin}
                        title="No addresses saved"
                        description="Add an address for faster checkout."
                        actionLabel="Add Address"
                        onAction={() => setIsAdding(true)}
                        className="col-span-full border-dashed"
                    />
                )}
            </div>
        </div>
    )
}
