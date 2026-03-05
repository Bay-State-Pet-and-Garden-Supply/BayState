'use client';

import { useState } from 'react';
import { Scraper, updateScraperStatus } from '@/lib/admin/scrapers';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Play, Clock, AlertTriangle, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ScraperCardProps {
  scraper: Scraper;
}

export function ScraperCard({ scraper }: ScraperCardProps) {
  const [disabled, setDisabled] = useState(scraper.disabled);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    setDisabled(!checked); // Optimistic update
    
    try {
      await updateScraperStatus(scraper.name, !checked);
      toast.success(`Scraper ${checked ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      setDisabled(checked); // Revert
      toast.error('Failed to update scraper status');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusVariant = (status: string, isDisabled: boolean): "default" | "secondary" | "destructive" | "outline" => {
    if (isDisabled) return 'secondary';
    switch (status) {
      case 'healthy': return 'default';
      case 'degraded': return 'outline'; // Yellowish tint if supported, else outline
      case 'broken': return 'destructive';
      default: return 'secondary';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-3 w-3" />;
      case 'degraded': return <AlertTriangle className="h-3 w-3" />;
      case 'broken': return <XCircle className="h-3 w-3" />;
      default: return <HelpCircle className="h-3 w-3" />;
    }
  };

  return (
    <>
      <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 pr-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                {scraper.display_name || scraper.name}
              </CardTitle>
              <CardDescription className="line-clamp-1 text-xs break-all" title={scraper.base_url}>
                {scraper.base_url}
              </CardDescription>
            </div>
            <Switch 
              checked={!disabled} 
              onCheckedChange={handleToggle} 
              disabled={isUpdating}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 pb-3">
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant={getStatusVariant(scraper.status, disabled)} className="gap-1 capitalize">
              {getStatusIcon(scraper.status)}
              {disabled ? 'Disabled' : scraper.status}
            </Badge>
            {scraper.requires_auth && (
              <Badge variant="outline" className="text-xs">Auth Required</Badge>
            )}
          </div>
          
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span className="text-xs">
                Last tested: {scraper.last_tested ? new Date(scraper.last_tested).toLocaleDateString() : 'Never'}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-3 border-t bg-muted/20">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
            onClick={() => window.location.href = `/admin/scrapers/${scraper.name}/test-lab`}
            disabled={disabled}
          >
            <Play className="h-3.5 w-3.5" />
            Test Scraper
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
