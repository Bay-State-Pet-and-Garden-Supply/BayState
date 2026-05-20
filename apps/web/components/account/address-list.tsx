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
                <Button onClick={() => setIsAdding(true)} size="lg" className="rounded-xl font-semibold shadow-sm">
                    <Plus className="mr-2 h-5 w-5" /> Add New Address
                </Button>
            )}

            {isAdding && (
                <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden max-w-2xl">
                    <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                        <div className="flex flex-col">
                            <h3 className="text-lg font-bold font-display text-zinc-900">New Address</h3>
                            <p className="text-sm text-zinc-500 font-body">Add a location for your deliveries.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setIsAdding(false)} className="rounded-xl">Cancel</Button>
                    </div>
                    <div className="p-8">
                        <AddressForm onSuccess={() => setIsAdding(false)} />
                    </div>
                </div>
            )}

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                {initialAddresses.map(addr => (
                    <div key={addr.id} className={cn(
                        "border border-zinc-200 rounded-2xl bg-white flex flex-col shadow-sm overflow-hidden transition-all",
                        addr.is_default ? "ring-2 ring-primary/20" : ""
                    )}>
                        <div className="p-6 relative flex-1">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 flex items-center text-[10px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full uppercase tracking-wider">
                                    <CheckCircle className="mr-1.5 h-3 w-3" /> Default
                                </div>
                            )}
                            <div className="font-bold text-xl tracking-tight pr-24 font-display text-zinc-900 leading-tight">{addr.full_name}</div>
                            <div className="text-sm text-zinc-600 mt-4 space-y-1 font-body">
                                <div>{addr.address_line1}</div>
                                {addr.address_line2 && <div>{addr.address_line2}</div>}
                                <div className="text-zinc-900 font-semibold">{addr.city}, {addr.state} {addr.zip_code}</div>
                                {addr.phone && <div className="mt-4 pt-4 border-t border-zinc-50 text-xs font-medium text-zinc-400">Phone: {addr.phone}</div>}
                            </div>
                        </div>

                        <div className="flex border-t border-zinc-100 bg-zinc-50/50 p-2 gap-2">
                            {!addr.is_default && (
                                <button 
                                    type="button"
                                    onClick={() => handleSetDefault(addr.id)} 
                                    className="flex-1 py-2 text-xs font-semibold text-zinc-500 hover:text-primary hover:bg-white rounded-lg transition-all font-body"
                                >
                                    Set as Default
                                </button>
                            )}
                            <button 
                                type="button"
                                aria-label={addr.is_default ? 'Delete address' : `Delete address for ${addr.full_name}`}
                                className={cn(
                                    "py-2 px-4 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all font-body font-semibold text-xs rounded-lg",
                                    addr.is_default ? "w-full text-center" : ""
                                )}
                                onClick={() => handleDelete(addr.id)}
                            >
                                <Trash2 className={cn("h-4 w-4 mx-auto", addr.is_default ? "inline mr-2" : "")} />
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
