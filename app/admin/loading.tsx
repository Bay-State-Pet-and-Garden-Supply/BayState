import { AdminPageSkeleton } from "@/components/admin/skeletons/admin-skeletons";

export default function AdminLoading() {
  return (
    <div className="container mx-auto py-6">
      <AdminPageSkeleton />
    </div>
  );
}
