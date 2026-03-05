'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import YAML from 'yaml';
import { ScraperConfigSchema } from '@/types/scraper';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Play } from 'lucide-react';

// Default template
const DEFAULT_CONFIG = `schema_version: "1.0"
name: "example-scraper"
base_url: "https://example.com"
selectors:
  - id: "product_name"
    name: "Product Name"
    selector: "h1.title"
    required: true
workflows:
  - action: "navigate"
    name: "Go to Home"
    params:
      url: "https://example.com"
`;

interface ConfigEditorProps {
  initialValue?: string;
  onSave?: (config: any) => void;
}

export default function ConfigEditor({ initialValue = DEFAULT_CONFIG, onSave }: ConfigEditorProps) {
  const [code, setCode] = useState(initialValue);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [parsedConfig, setParsedConfig] = useState<any>(null);

  const validateConfig = useCallback((yamlString: string) => {
    try {
      const parsed = YAML.parse(yamlString);
      setParsedConfig(parsed);

      // If parsed is null or undefined (empty string), it's technically valid YAML but might fail schema
      if (!parsed) {
         setErrors(['Configuration cannot be empty']);
         setIsValid(false);
         return;
      }

      const result = ScraperConfigSchema.safeParse(parsed);

      if (result.success) {
        setErrors([]);
        setIsValid(true);
        if (onSave) {
            // Optionally auto-save or just notify parent of valid state
        }
      } else {
        const formattedErrors = result.error.issues.map(
          (err) => `${err.path.join('.')}: ${err.message}`
        );
        setErrors(formattedErrors);
        setIsValid(false);
      }
    } catch (e: any) {
      setErrors([`YAML Parse Error: ${e.message}`]);
      setIsValid(false);
      setParsedConfig(null);
    }
  }, [onSave]);

  useEffect(() => {
    validateConfig(code);
  }, [code, validateConfig]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  const handleDryRun = () => {
    console.log('Dry Run clicked with config:', parsedConfig);
    alert('Dry Run initiated! (Check console for parsed config)');
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Configuration Editor</h2>
        <div className="space-x-2">
           <Button 
            variant="outline" 
            onClick={handleDryRun}
            disabled={!isValid}
          >
            <Play className="w-4 h-4 mr-2" />
            Dry Run
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
        <div className="lg:col-span-2 border rounded-md overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="yaml"
            value={code}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
            }}
          />
        </div>

        <div className="lg:col-span-1 space-y-4 overflow-y-auto">
          <div className="p-4 border rounded-md bg-card">
            <h3 className="font-medium mb-2">Validation Status</h3>
            {isValid ? (
              <div className="text-green-500 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Valid Configuration
              </div>
            ) : (
              <div className="text-red-500 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Invalid Configuration
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1 mt-2 text-sm">
                  {errors.map((err, index) => (
                    <li key={index}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="text-xs text-muted-foreground mt-4">
            <p>Edit the YAML configuration on the left. The editor will validate your schema in real-time.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
