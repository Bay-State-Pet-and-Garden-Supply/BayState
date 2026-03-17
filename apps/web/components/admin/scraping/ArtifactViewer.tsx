'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, FileJson, GitCompare } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScrapeResult } from '@/types/scraper';

interface ArtifactViewerProps {
  jobId: string;
  className?: string;
}

export function ArtifactViewer({ jobId, className }: ArtifactViewerProps) {
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('scrape_results')
          .select('*')
          .eq('job_id', jobId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setResults(data as ScrapeResult[]);
        }
      } catch (err) {
        console.error('Failed to fetch scrape results:', err);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) {
      fetchResults();
    }
  }, [jobId, supabase]);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading scraped data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="py-3 px-4 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Scraped Artifacts</h3>
          <span className="text-xs text-muted-foreground">
            ({results.length} result{results.length !== 1 ? 's' : ''})
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="raw" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-10">
            <TabsTrigger value="raw" className="gap-2">
              <FileJson className="w-3.5 h-3.5" />
              Raw Scraped Product
            </TabsTrigger>
            <TabsTrigger value="comparison" className="gap-2">
              <GitCompare className="w-3.5 h-3.5" />
              Comparison
            </TabsTrigger>
          </TabsList>

          <TabsContent value="raw" className="m-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4">
                {results.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No scraped results found for this job.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((result, index) => (
                      <div
                        key={result.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <div className="bg-muted/50 px-3 py-2 text-xs font-medium flex items-center justify-between">
                          <span>
                            Result {index + 1} — {result.runner_name}
                          </span>
                          <span className="text-muted-foreground font-normal">
                            {new Date(result.created_at).toLocaleString()}
                          </span>
                        </div>
                        <pre className="p-3 text-xs overflow-x-auto font-mono bg-background">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comparison" className="m-0">
            <div className="p-8 text-center text-muted-foreground">
              <GitCompare className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Comparison view coming soon</p>
              <p className="text-xs mt-1">
                This will show "Source of Truth" vs "Scraped Result" comparison
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
