'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Eye, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserProfile } from '@/lib/admin/users';
import { CustomerModal } from './CustomerModal';

interface CustomersClientProps {
    customers: UserProfile[];
    count: number;
}

export function CustomersClient({ customers, count }: CustomersClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const page = Number(searchParams.get('page')) || 1;
    const initialSearch = searchParams.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const totalPages = Math.ceil(count / 10);

    const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`?q=${encodeURIComponent(searchTerm)}&page=1`);
    };

    const clearSearch = () => {
        setSearchTerm('');
        router.push('?');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
                    <p className="text-muted-foreground">Manage your customer base</p>
                </div>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <Input
                        type="search"
                        placeholder="Search customers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-[250px]"
                    />
                    <Button type="submit" size="icon" variant="secondary" aria-label="Search customers">
                        <Search className="h-4 w-4" />
                    </Button>
                    {initialSearch && (
                        <Button type="button" variant="ghost" onClick={clearSearch}>
                            Clear
                        </Button>
                    )}
                </form>
            </div>

            <div className="rounded-md border bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/50">
                            <tr className="text-left font-medium">
                                <th className="p-4">Customer</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Joined</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((customer) => (
                                <tr key={customer.id} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                                <UserCircle className="h-5 w-5" />
                                            </div>
                                            <span className="font-medium">{customer.full_name || 'Guest User'}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">{customer.email}</td>
                                    <td className="p-4">{new Date(customer.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(customer)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {customers.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                        No customers found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                        {page > 1 ? (
                            <Link href={`?page=${page - 1}&q=${initialSearch}`}>Previous</Link>
                        ) : (
                            <span>Previous</span>
                        )}
                    </Button>
                    <div className="flex items-center text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </div>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
                        {page < totalPages ? (
                            <Link href={`?page=${page + 1}&q=${initialSearch}`}>Next</Link>
                        ) : (
                            <span>Next</span>
                        )}
                    </Button>
                </div>
            )}

            {selectedCustomer && (
                <CustomerModal
                    customer={selectedCustomer}
                    onClose={() => setSelectedCustomer(null)}
                />
            )}
        </div>
    );
}
