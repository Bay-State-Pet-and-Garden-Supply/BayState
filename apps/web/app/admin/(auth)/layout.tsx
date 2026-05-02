import { AdminLayoutStyles } from '@/components/admin/AdminLayoutStyles'

export default function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      data-ui-surface="admin"
      className="flex min-h-screen items-center justify-center bg-[var(--surface-admin-bg)]"
    >
      <AdminLayoutStyles />
      {children}
    </div>
  )
}
