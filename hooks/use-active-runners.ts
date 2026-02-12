import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScraperRunner } from '@/types/scraper';

export function useActiveRunners() {
  const [runners, setRunners] = useState<ScraperRunner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const fetchRunners = async () => {
      try {
        const { data, error } = await supabase
          .from('scraper_runners')
          .select('*')
          .order('last_seen_at', { ascending: false });

        if (error) {
          console.error('Error fetching runners:', error);
        } else {
          setRunners(data || []);
        }
      } catch (err) {
        console.error('Unexpected error fetching runners:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRunners();

    const channel = supabase
      .channel('scraper_runners_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraper_runners',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRunners((prev) => [payload.new as ScraperRunner, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setRunners((prev) =>
              prev.map((runner) =>
                runner.name === (payload.new as ScraperRunner).name
                  ? (payload.new as ScraperRunner)
                  : runner
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setRunners((prev) =>
              prev.filter((runner) => runner.name !== (payload.old as ScraperRunner).name)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { runners, isLoading };
}
