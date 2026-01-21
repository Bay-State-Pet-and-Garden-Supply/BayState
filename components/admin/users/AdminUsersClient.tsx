'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserRoleSelect } from '@/components/admin/user-role-select';
import { UserProfile } from '@/lib/admin/users';
import { UserModal } from './UserModal';

interface AdminUsersClientProps {
    users: UserProfile[];
    count: number;
}

export function AdminUsersClient({ users, count }: AdminUsersClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const page = Number(searchParams.get('page')) || 1;
    const initialSearch = searchParams.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const totalPages = Math.ceil(count / 10);

    // Modal State
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`?q=${encodeURIComponent(searchTerm)}&page=1`);
    };

    const clearSearch = () => {
        setSearchTerm('');
        router.push('?');
    };

    const handleCloseModal = () => {
        setSelectedUser(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <Input
                        type="search"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-[250px]"
                    />
                    <Button type="submit" size="icon" variant="secondary" aria-label="Search users">
                        <Search className="h-4 w-4" />
                    </Button>
                    {initialSearch && (
                        <Button type="button" variant="ghost" onClick={clearSearch}>
                            Clear
                        </Button>
                    )}
                </form>
            </div>

            <div className="rounded-md border">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/50">
                            <tr className="text-left font-medium">
                                <th className="p-4">Name</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Joined</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-4 font-medium">{user.full_name || 'N/A'}</td>
                                    <td className="p-4">{user.email}</td>
                                    <td className="p-4">
                                        <UserRoleSelect userId={user.id} currentRole={user.role} />
                                    </td>
                                    <td className="p-4">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                    {page > 1 ? (
                        <Link href={`?page=${page - 1}&q=${initialSearch}`}>Previous</Link>
                    ) : (
                        <span>Previous</span>
                    )}
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
                    {page < totalPages ? (
                        <Link href={`?page=${page + 1}&q=${initialSearch}`}>Next</Link>
                    ) : (
                        <span>Next</span>
                    )}
                </Button>
            </div>

            {selectedUser && (
                <UserModal
                    user={selectedUser}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
}
