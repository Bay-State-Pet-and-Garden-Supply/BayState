'use client';

import React from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const DEFAULT_ANTI_DETECTION = {
  enable_captcha_detection: false,
  enable_rate_limiting: false,
  enable_human_simulation: false,
  enable_session_rotation: false,
  enable_blocking_handling: false,
  rate_limit_min_delay: 1.0,
  rate_limit_max_delay: 3.0,
  session_rotation_interval: 100,
  max_retries_on_detection: 3,
};

export function GlobalSettings() {
  const { config, setGeneralInfo, updateConfig } = useScraperEditorStore();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General Information</CardTitle>
          <CardDescription>Basic details about the scraper.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Internal Name (ID)</Label>
              <Input 
                id="name" 
                placeholder="e.g. amazon_products" 
                value={config.name}
                onChange={(e) => setGeneralInfo({ ...config, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Unique identifier used in code and logs.</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input 
                id="display_name" 
                placeholder="e.g. Amazon Product Scraper" 
                value={config.display_name || ''}
                onChange={(e) => setGeneralInfo({ ...config, display_name: e.target.value })}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="base_url">Base URL</Label>
            <Input 
              id="base_url" 
              placeholder="https://www.example.com" 
              value={config.base_url}
              onChange={(e) => setGeneralInfo({ ...config, base_url: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execution Parameters</CardTitle>
          <CardDescription>Timeouts, retries, and quality settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input 
                id="timeout" 
                type="number"
                min={1}
                max={300}
                value={config.timeout}
                onChange={(e) => updateConfig({ timeout: parseInt(e.target.value) || 30 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="retries">Max Retries</Label>
              <Input 
                id="retries" 
                type="number"
                min={0}
                max={10}
                value={config.retries}
                onChange={(e) => updateConfig({ retries: parseInt(e.target.value) || 3 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image_quality">Image Quality (0-100)</Label>
              <Input 
                id="image_quality" 
                type="number"
                min={0}
                max={100}
                value={config.image_quality}
                onChange={(e) => updateConfig({ image_quality: parseInt(e.target.value) || 50 })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anti-Detection</CardTitle>
          <CardDescription>Configure how the scraper avoids being blocked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Human Simulation</Label>
              <p className="text-xs text-muted-foreground">Add random delays and mouse movements.</p>
            </div>
            <Switch 
              aria-label="Enable human simulation"
              checked={config.anti_detection?.enable_human_simulation || false}
              onCheckedChange={(checked) => updateConfig({ 
                anti_detection: { ...DEFAULT_ANTI_DETECTION, ...config.anti_detection, enable_human_simulation: checked } 
              })}
            />
          </div>
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Session Rotation</Label>
              <p className="text-xs text-muted-foreground">Rotate browser sessions periodically.</p>
            </div>
            <Switch 
              aria-label="Enable session rotation"
              checked={config.anti_detection?.enable_session_rotation || false}
              onCheckedChange={(checked) => updateConfig({ 
                anti_detection: { ...DEFAULT_ANTI_DETECTION, ...config.anti_detection, enable_session_rotation: checked } 
              })}
            />
          </div>
          
           <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Rate Limiting</Label>
              <p className="text-xs text-muted-foreground">Enforce minimum delays between requests.</p>
            </div>
            <Switch 
              aria-label="Enable rate limiting"
              checked={config.anti_detection?.enable_rate_limiting || false}
              onCheckedChange={(checked) => updateConfig({
                anti_detection: { ...DEFAULT_ANTI_DETECTION, ...config.anti_detection, enable_rate_limiting: checked } 
              })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
