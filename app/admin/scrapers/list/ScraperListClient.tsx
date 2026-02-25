'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, ExternalLink, Play, SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ScraperListClient({ initialScrapers }: { initialScrapers: any[] }) {
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
      if (healthFilter === 'healthy' && (score === null || score < 90)) return false;
      if (healthFilter === 'warning' && (score === null || score < 60 || score >= 90)) return false;
      if (healthFilter === 'critical' && (score === null || score >= 60)) return false;
    }
    
    return true;
  });

  const getHealthColor = (score: number | null) => {
    if (score === null || score === undefined) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (score >= 90) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getHealthLabel = (score: number | null) => {
    if (score === null || score === undefined) return 'Unknown';
    if (score >= 90) return 'Healthy';
    if (score >= 60) return 'Warning';
    return 'Critical';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block text-gray-700">Status</label>
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
          <label className="text-sm font-medium mb-1.5 block text-gray-700">Health</label>
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
          <label className="text-sm font-medium mb-1.5 block text-gray-700">Type</label>
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
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-xl border border-dashed">
          <SearchX className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No scrapers found</h3>
          <p className="text-gray-500 mt-1 max-w-sm text-center mb-6">
            Adjust your filters or create a new scraper to get started.
          </p>
          <Button onClick={() => {
            setStatusFilter('all');
            setHealthFilter('all');
            setTypeFilter('all');
          }} variant="outline">
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScrapers.map((scraper) => (
            <Card key={scraper.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3 border-b bg-gray-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl font-semibold leading-tight text-gray-900 group-hover:text-[#66161D] transition-colors">
                      <Link href={`/admin/scrapers/${scraper.slug}`}>
                        {scraper.name || scraper.slug}
                      </Link>
                    </CardTitle>
                    <CardDescription className="text-sm mt-1 flex items-center gap-1.5">
                      {scraper.domain || 'No domain'}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2 text-gray-500 hover:text-gray-900">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/scrapers/${scraper.slug}`}>View Details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/scrapers/test-lab/${scraper.slug}`}>Run Test</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>Toggle Status</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-2">
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline" className={`capitalize ${
                    scraper.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    scraper.status === 'draft' ? 'bg-gray-100 text-gray-700 border-gray-200' : 
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
                
                <div className="text-xs text-gray-500">
                  Last tested: {scraper.last_test_at 
                    ? new Date(scraper.last_test_at).toLocaleDateString() 
                    : 'Never'}
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4 bg-white border-t flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 bg-white hover:bg-gray-50 text-gray-700" asChild>
                  <Link href={`/admin/scrapers/${scraper.slug}`}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    View
                  </Link>
                </Button>
                <Button size="sm" className="flex-1 bg-[#008850] hover:bg-[#2a7034] text-white" asChild>
                  <Link href={`/admin/scrapers/test-lab/${scraper.slug}`}>
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Test
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
