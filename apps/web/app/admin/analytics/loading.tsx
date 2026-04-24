import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AnalyticsLoading() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="font-display font-black uppercase tracking-tighter text-4xl mb-8">
        Analytics & Reporting
      </h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none bg-white">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none p-6 bg-white">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-[400px] w-full" />
      </Card>
    </div>
  );
}
