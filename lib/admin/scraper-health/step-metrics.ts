import { createClient } from '@/lib/supabase/client';

export interface SelectorHealth {
  selector: string;
  found_count: number;
  missed_count: number;
  success_rate: number;
  last_missed_at: string | null;
}

export interface FailingStep {
  step_name: string;
  failure_count: number;
  last_failed_at: string;
  affected_config: string;
}

export async function getSelectorHealthStats(days = 30): Promise<SelectorHealth[]> {
  const supabase = createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('scraper_test_runs')
    .select(`
      selector_health,
      created_at
    `)
    .gte('created_at', startDate.toISOString())
    .not('selector_health', 'is', null);

  if (error) {
    console.error('Error fetching selector health:', error);
    return [];
  }

  const stats: Record<string, { found: number; missed: number; lastMissed: string | null }> = {};

  data.forEach((run: any) => {
    const health = run.selector_health as Record<string, string>;
    if (!health) return;

    Object.entries(health).forEach(([selector, status]) => {
      if (!stats[selector]) {
        stats[selector] = { found: 0, missed: 0, lastMissed: null };
      }

      if (status === 'found') {
        stats[selector].found++;
      } else {
        stats[selector].missed++;
        
        if (!stats[selector].lastMissed || new Date(run.created_at) > new Date(stats[selector].lastMissed!)) {
          stats[selector].lastMissed = run.created_at;
        }
      }
    });
  });

  return Object.entries(stats)
    .map(([selector, data]) => ({
      selector,
      found_count: data.found,
      missed_count: data.missed,
      success_rate: Math.round((data.found / (data.found + data.missed)) * 100),
      last_missed_at: data.lastMissed
    }))
    .sort((a, b) => b.missed_count - a.missed_count)
    .slice(0, 20); 
}

export async function getTopFailingSteps(days = 30): Promise<FailingStep[]> {
  const supabase = createClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('scraper_test_runs')
    .select(`
      error_message,
      created_at,
      scraper_configs (
        name
      )
    `)
    .eq('status', 'failed')
    .gte('created_at', startDate.toISOString())
    .not('error_message', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching failing steps:', error);
    return [];
  }

  const stepFailures: Record<string, FailingStep> = {};

  data.forEach((run: any) => {
    const match = run.error_message?.match(/Step '([^']+)' failed/i);
    const stepName = match ? match[1] : 'Unknown Step';
    
    const key = `${stepName}-${run.scraper_configs?.name}`;

    if (!stepFailures[key]) {
      stepFailures[key] = {
        step_name: stepName,
        failure_count: 0,
        last_failed_at: run.created_at,
        affected_config: run.scraper_configs?.name || 'Unknown Config'
      };
    }

    stepFailures[key].failure_count++;
  });

  return Object.values(stepFailures)
    .sort((a, b) => b.failure_count - a.failure_count)
    .slice(0, 10);
}
