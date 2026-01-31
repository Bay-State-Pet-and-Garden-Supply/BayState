import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Plus, FileCode, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'New Configuration | Scraper Lab',
};

export default function ScraperLabNewPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/admin/scraper-lab">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Scraper Lab
          </Link>
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">New Configuration</h1>
            <p className="text-muted-foreground mt-1">
              Create a new scraper configuration using the wizard.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <Link href="/admin/scraper-configs/new">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Form Wizard
              </CardTitle>
              <CardDescription>
                Step-by-step guided configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use the form-based wizard to create a new configuration with guided steps for each section.
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <Link href="/admin/scraper-lab">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                YAML Editor
              </CardTitle>
              <CardDescription>
                Direct YAML editing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create a new configuration using direct YAML editing for full control over the configuration structure.
              </p>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Template
            </CardTitle>
            <CardDescription>
              Start from a template
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Choose from pre-built templates for common scraping scenarios to get started quickly.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
