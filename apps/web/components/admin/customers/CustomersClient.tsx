'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Search, UserCircle } from 'lucide-react';
import { AdminControlBar } from '@/components/admin/admin-control-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type UserProfile } from '@/lib/admin/users';
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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(`?q=${encodeURIComponent(searchTerm)}&page=1`);
  };

  const clearSearch = () => {
    setSearchTerm('');
    router.push('?');
  };

  return (
    <div className="space-y-5 pb-6">
      <AdminControlBar>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Customer directory</p>
            <p className="text-sm text-muted-foreground">{count} customer records in this view.</p>
          </div>
          <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search customers"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit">Search</Button>
            {initialSearch ? (
              <Button type="button" variant="outline" onClick={clearSearch}>
                Clear
              </Button>
            ) : null}
          </form>
        </div>
      </AdminControlBar>

      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-4 text-xs font-medium">Customer</th>
                <th className="p-4 text-xs font-medium">Email</th>
                <th className="p-4 text-xs font-medium">Joined</th>
                <th className="p-4 text-right text-xs font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <span className="font-medium text-foreground">{customer.full_name || 'Guest user'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-foreground/85">{customer.email}</td>
                  <td className="p-4 text-muted-foreground">{new Date(customer.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(customer)}>
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="text-sm text-muted-foreground">Page {page} of {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
              {page > 1 ? <Link href={`?page=${page - 1}&q=${initialSearch}`}>Previous</Link> : <span>Previous</span>}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
              {page < totalPages ? <Link href={`?page=${page + 1}&q=${initialSearch}`}>Next</Link> : <span>Next</span>}
            </Button>
          </div>
        </div>
      ) : null}

      {selectedCustomer ? (
        <CustomerModal customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      ) : null}
    </div>
  );
}
