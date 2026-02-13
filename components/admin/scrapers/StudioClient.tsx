'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function StudioClient() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scraper Studio</h1>
          <p className="text-muted-foreground">
            Advanced environment for scraper development, testing, and monitoring.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          v1.0.0-beta
        </div>
      </div>

      <Tabs defaultValue="configs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configs">Configs</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="configs" className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Scraper configurations will appear here.
          </div>
        </TabsContent>
        <TabsContent value="testing" className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Testing interface will appear here.
          </div>
        </TabsContent>
        <TabsContent value="health" className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Health monitoring dashboard will appear here.
          </div>
        </TabsContent>
        <TabsContent value="history" className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Execution history will appear here.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
