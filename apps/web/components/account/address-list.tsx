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
                <Button onClick={() => setIsAdding(true)} className="h-14 px-8 text-lg font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all">
                    <Plus className="mr-2 h-6 w-6" /> Add New Address
                </Button>
            )}

            {isAdding && (
                <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(249,115,22,1)] overflow-hidden">
                    <div className="bg-orange-600 p-4 border-b-4 border-zinc-900 text-white flex justify-between items-center">
                        <div className="flex flex-col">
                            <h3 className="text-2xl font-black uppercase tracking-tight font-display">New Address</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-100">Add a location for your deliveries.</p>
                        </div>
                        <Button variant="ghost" onClick={() => setIsAdding(false)} className="h-10 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 rounded-none">Cancel</Button>
                    </div>
                    <div className="p-8">
                        <AddressForm onSuccess={() => setIsAdding(false)} />
                    </div>
                </div>
            )}

            <div className="grid gap-8 grid-cols-1 md:grid-cols-2">
                {initialAddresses.map(addr => (
                    <div key={addr.id} className={cn(
                        "border-4 border-zinc-900 bg-white flex flex-col transition-all",
                        addr.is_default ? "shadow-[8px_8px_0px_rgba(0,0,0,1)] ring-4 ring-zinc-900/5" : "shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,0.2)]"
                    )}>
                        <div className="p-6 relative flex-1">
                            {addr.is_default && (
                                <div className="absolute top-4 right-4 flex items-center text-[10px] font-black uppercase tracking-widest text-white bg-zinc-900 px-3 py-1.5 shadow-[4px_4px_0px_rgba(0,0,0,0.2)]">
                                    <CheckCircle className="mr-1.5 h-3 w-3 text-primary" /> Default
                                </div>
                            )}
                            <div className="font-black text-2xl uppercase tracking-tighter pr-24 font-display leading-tight">{addr.full_name}</div>
                            <div className="text-base font-bold text-zinc-600 mt-4 space-y-1">
                                <div>{addr.address_line1}</div>
                                {addr.address_line2 && <div>{addr.address_line2}</div>}
                                <div className="text-zinc-900">{addr.city}, {addr.state} {addr.zip_code}</div>
                                {addr.phone && <div className="mt-4 pt-4 border-t-2 border-zinc-100 text-xs font-black uppercase tracking-widest text-zinc-400">TEL: {addr.phone}</div>}
                            </div>
                        </div>

                        <div className="flex border-t-4 border-zinc-900 bg-zinc-50">
                            {!addr.is_default && (
                                <button 
                                    onClick={() => handleSetDefault(addr.id)} 
                                    className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border-r-4 border-zinc-900 transition-colors"
                                >
                                    Set as Default
                                </button>
                            )}
                            <button 
                                className={cn(
                                    "py-4 px-6 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors",
                                    addr.is_default ? "w-full text-center font-black uppercase text-xs tracking-widest" : ""
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
