'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import YAML from 'yaml';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { toast } from 'sonner';

export function YamlImportDialog() {
  const [open, setOpen] = React.useState(false);
  const [yamlContent, setYamlContent] = React.useState('');
  const { updateConfig } = useScraperEditorStore();

  const handleImport = () => {
    try {
      const parsed = YAML.parse(yamlContent);
      // Basic validation
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML format');
      }
      
      updateConfig(parsed);
      toast.success('Configuration imported successfully');
      setOpen(false);
    } catch (e) {
      toast.error('Failed to parse YAML: ' + (e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" /> Import YAML
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Import YAML Configuration</DialogTitle>
          <DialogDescription>
            Paste your existing scraper YAML configuration below. This will overwrite current settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea 
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            placeholder="Paste YAML content here..."
            className="h-[300px] font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleImport}>Import Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
