import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScrapeJob } from '@/types/scraper';

const PAGE_SIZE = 20;

export function useScraperJobs() {
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  
  // Use ref to keep the client stable across renders
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const getSupabaseClient = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const fetchJobs = useCallback(async (pageNumber: number) => {
    const supabase = getSupabaseClient();
    try {
      setIsLoading(true);
      const from = pageNumber * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('scrape_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Error fetching scraper jobs:', error);
        return;
      }

      if (data) {
        setJobs((prevJobs) => {
          // If it's the first page, replace all jobs
          if (pageNumber === 0) {
            return data as ScrapeJob[];
          }
          // Otherwise append, avoiding duplicates just in case
          const newJobs = data as ScrapeJob[];
          const existingIds = new Set(prevJobs.map(j => j.id));
          const uniqueNewJobs = newJobs.filter(j => !existingIds.has(j.id));
          return [...prevJobs, ...uniqueNewJobs];
        });

        if (data.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getSupabaseClient]);

  useEffect(() => {
    fetchJobs(0);
  }, [fetchJobs]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage);
    }
  }, [isLoading, hasMore, page, fetchJobs]);

  return {
    jobs,
    isLoading,
    loadMore,
    hasMore,
  };
}
