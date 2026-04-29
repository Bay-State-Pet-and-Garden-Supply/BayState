import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="admin-page-title">Analytics & reporting</h1>
        <p className="admin-page-copy">Loading channel metrics and operational reporting.</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border border-zinc-200 bg-white shadow-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-zinc-200 bg-white p-6 shadow-none">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-[400px] w-full" />
      </Card>
    </div>
  );
}
