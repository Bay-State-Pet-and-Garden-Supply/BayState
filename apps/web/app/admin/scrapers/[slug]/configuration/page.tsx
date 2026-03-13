import { notFound } from 'next/navigation';
import { getLocalScraperConfig } from '@/lib/admin/scrapers/configs';
import { YamlViewer } from '@/components/admin/scrapers/YamlViewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';

interface ConfigurationPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ConfigurationPage({ params }: ConfigurationPageProps) {
  const { slug } = await params;
  const result = await getLocalScraperConfig(slug);

  if (!result) {
    notFound();
  }

  return (
    <div className="space-y-6 pb-12" data-testid="tab-content-configuration">
      <Alert className="bg-blue-50 border-blue-200 text-blue-800">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900 font-semibold">Local Configuration</AlertTitle>
        <AlertDescription className="text-blue-800">
          This configuration is stored as a YAML file in the repository. Edits should be made directly in the source code within the development environment.
        </AlertDescription>
      </Alert>

      <div className="h-[700px]">
        <YamlViewer 
          yaml={result.yaml} 
          filename={result.config.file_path || `${slug}.yaml`} 
        />
      </div>
    </div>
  );
}
