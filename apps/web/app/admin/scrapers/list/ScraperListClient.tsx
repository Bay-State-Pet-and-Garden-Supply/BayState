'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, ExternalLink, Play, SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export function ScraperListClient({ initialScrapers }: { initialScrapers: ScraperConfig[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredScrapers = initialScrapers.filter(scraper => {
    // Status filter
    if (statusFilter !== 'all' && scraper.status !== statusFilter) {
      return false;
    }
    
    // Type filter
    if (typeFilter !== 'all' && scraper.scraper_type !== typeFilter) {
      return false;
    }
    
    // Health filter
    if (healthFilter !== 'all') {
      const score = scraper.health_score;
      if (score === null || score === undefined) return false;
      if (healthFilter === 'healthy' && score < 90) return false;
      if (healthFilter === 'warning' && (score < 60 || score >= 90)) return false;
      if (healthFilter === 'critical' && score >= 60) return false;
    }
    
    return true;
  });

  const getHealthColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'bg-muted text-foreground border-border';
    if (score >= 90) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getHealthLabel = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'Unknown';
    if (score >= 90) return 'Healthy';
    if (score >= 60) return 'Warning';
    return 'Critical';
  };

  return (
    <div className="space-y-6" data-testid="scraper-list">
      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg shadow-sm border" data-testid="scraper-filters">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Health</label>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Health</SelectItem>
              <SelectItem value="healthy">Healthy (≥90)</SelectItem>
              <SelectItem value="warning">Warning (60-89)</SelectItem>
              <SelectItem value="critical">Critical (&lt;60)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="static">Static</SelectItem>
              <SelectItem value="agentic">Agentic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredScrapers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-muted rounded-xl border border-dashed" data-testid="scraper-list-empty">
          <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No scrapers found</h3>

          <Button onClick={() => {
            setStatusFilter('all');
            setHealthFilter('all');
            setTypeFilter('all');
          }} variant="outline">
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="scraper-card-grid">
          {filteredScrapers.map((scraper) => (
            <Card key={scraper.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow group" data-testid="scraper-card">
              <CardHeader className="pb-3 border-b bg-muted/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl font-semibold leading-tight text-foreground group-hover:text-[#66161D] transition-colors">
                      <Link href={`/admin/scrapers/${scraper.slug}`} data-testid="scraper-card-title-link">
                        {scraper.name || scraper.slug}
                      </Link>
                    </CardTitle>
                    <CardDescription className="text-sm mt-1 flex items-center gap-1.5">
                      {scraper.domain || 'No domain'}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={`https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/${scraper.file_path || `scrapers/configs/${scraper.slug}.yaml`}`} target="_blank" rel="noopener noreferrer">
                          View on GitHub
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline" className={`capitalize ${
                    scraper.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    scraper.status === 'draft' ? 'bg-muted text-muted-foreground border-border' : 
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {scraper.status || 'draft'}
                  </Badge>
                  <Badge variant="outline" className={`font-medium ${getHealthColor(scraper.health_score)}`}>
                    {getHealthLabel(scraper.health_score)} {scraper.health_score !== null && `(${scraper.health_score}%)`}
                  </Badge>
                  <Badge variant="outline" className="bg-[#FCD048]/10 text-amber-800 border-amber-200">
                    {scraper.scraper_type || 'static'}
                  </Badge>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Last tested: {scraper.last_test_at 
                    ? new Date(scraper.last_test_at).toLocaleDateString() 
                    : 'Never'}
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4 bg-card border-t flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 bg-card hover:bg-muted text-muted-foreground" asChild>
                  <Link href={`/admin/scrapers/${scraper.slug}`} data-testid="scraper-card-view-link">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    View
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
