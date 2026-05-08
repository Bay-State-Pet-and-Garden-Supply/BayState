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
                <Button onClick={() => setIsAdding(true)} className="h-14 px-8 text-lg font-bold border-b-4 border-brand-burgundy/20 rounded-md shadow-lg active:translate-y-1 active:border-b-0 transition-all bg-brand-forest-dark hover:bg-brand-forest-green text-white font-display uppercase tracking-widest">
                    <Plus className="mr-2 h-6 w-6" /> Add New Address
                </Button>
            )}

            {isAdding && (
                <div className="border border-zinc-200 rounded-lg bg-white shadow-sm overflow-hidden">
                    <div className="bg-brand-forest-dark p-4 border-b-2 border-brand-burgundy text-white flex justify-between items-center">
                        <div className="flex flex-col">
                            <h3 className="text-2xl font-bold font-display">New Address</h3>
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-200/80">Add a location for your deliveries.</p>
                        </div>
                        <Button variant="outline" onClick={() => setIsAdding(false)} className="bg-white text-primary border border-zinc-200 rounded-md font-semibold text-xs">Cancel</Button>
                    </div>
                    <div className="p-8">
                        <AddressForm onSuccess={() => setIsAdding(false)} />
                    </div>
                </div>
            )}

            <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
                {initialAddresses.map(addr => (
                    <div key={addr.id} className={cn(
                        "border border-zinc-200 rounded-lg bg-white flex flex-col shadow-sm overflow-hidden transition-all",
                        addr.is_default ? "ring-2 ring-brand-burgundy" : ""
                    )}>
                        <div className="p-6 relative flex-1">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 flex items-center text-[10px] font-bold text-white bg-brand-burgundy px-3 py-1.5 rounded-sm shadow-sm uppercase tracking-widest">
                                    <CheckCircle className="mr-1.5 h-3 w-3 text-accent" /> Default
                                </div>
                            )}
                            <div className="font-bold text-2xl tracking-tight pr-24 font-display leading-tight">{addr.full_name}</div>
                            <div className="text-base font-medium text-zinc-600 mt-4 space-y-1">
                                <div>{addr.address_line1}</div>
                                {addr.address_line2 && <div>{addr.address_line2}</div>}
                                <div className="text-zinc-900 font-bold">{addr.city}, {addr.state} {addr.zip_code}</div>
                                {addr.phone && <div className="mt-4 pt-4 border-t border-zinc-100 text-xs font-bold uppercase tracking-widest text-zinc-400">TEL: {addr.phone}</div>}
                            </div>
                        </div>

                        <div className="flex border-t border-zinc-100 bg-zinc-50">
                            {!addr.is_default && (
                                <button 
                                    type="button"
                                    onClick={() => handleSetDefault(addr.id)} 
                                    className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-zinc-600 hover:text-brand-forest-green hover:bg-white border-r border-zinc-100 transition-all font-display"
                                >
                                    Set as Default
                                </button>
                            )}
                            <button 
                                type="button"
                                aria-label={addr.is_default ? 'Delete address' : `Delete address for ${addr.full_name}`}
                                className={cn(
                                    "py-4 px-6 text-brand-burgundy hover:bg-brand-burgundy hover:text-white transition-all font-display font-bold uppercase tracking-widest text-xs",
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
