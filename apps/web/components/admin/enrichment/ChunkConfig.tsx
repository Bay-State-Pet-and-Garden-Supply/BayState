import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, DollarSign, Server, Settings2, Users } from "lucide-react";
import { EnrichmentMethod } from "./MethodSelection";

export interface ChunkConfigProps {
  method: EnrichmentMethod;
  config: unknown;
  selectedSkus: string[];
  onNext: (data: {
    chunkSize: number;
    maxWorkers: number;
    maxRunners?: number;
  }) => void;
  onBack?: () => void;
}

export function ChunkConfig({
  method,
  config,
  selectedSkus,
  onNext,
  onBack,
}: ChunkConfigProps) {
  const [chunkSize, setChunkSize] = useState<number>(50);
  const [maxWorkers, setMaxWorkers] = useState<number>(3);
  const [maxRunners, setMaxRunners] = useState<string>("");

  const skuCount = selectedSkus.length;

  const calculateCostEstimate = () => {
    if (method === "scrapers") return null;

    if (method === "ai_search") {
      const aiConfig = config as { maxAISearchCostUsd?: number; extraction_strategy?: string; llm_model?: string };
      const maxCost = aiConfig?.maxAISearchCostUsd || 10.0;

      if (aiConfig?.extraction_strategy === "llm_free") return 0.0;

      const perProductCost = aiConfig?.llm_model === "gpt-4o" ? 0.02 : 0.005;
      const estimatedCost = Math.min(skuCount * perProductCost, maxCost);
      return estimatedCost;
    }

    return null;
  };

  const handleNext = () => {
    const parsedWorkers = Math.max(1, Math.min(10, maxWorkers));
    const parsedRunners = maxRunners ? parseInt(maxRunners, 10) : undefined;

    onNext({
      chunkSize,
      maxWorkers: parsedWorkers,
      maxRunners:
        parsedRunners && !isNaN(parsedRunners) && parsedRunners > 0
          ? parsedRunners
          : undefined,
    });
  };

  const estimatedCost = calculateCostEstimate();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          Execution Configuration
        </CardTitle>
        <CardDescription>
          Configure how the enrichment jobs will be distributed and executed
          across runners.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {method === "ai_search" && estimatedCost !== null && (
          <Alert className="bg-primary/5 border-primary/20">
            <DollarSign className="h-4 w-4 text-primary" />
            <AlertDescription
              className="font-medium text-primary"
              data-testid="cost-estimate"
            >
              ~${estimatedCost.toFixed(3)} estimated cost for {skuCount}{" "}
              products
            </AlertDescription>
          </Alert>
        )}


        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label htmlFor="chunk-size" className="text-base font-semibold">
                SKUs per Chunk
              </Label>
              <span className="font-mono bg-muted px-2 py-1 rounded text-sm">
                {chunkSize} SKUs
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Number of products to process in a single job. Smaller chunks
              provide better progress tracking but slight overhead.
            </p>

            <div className="pt-2">
              <Slider
                id="chunk-size"
                defaultValue={[50]}
                max={100}
                min={10}
                step={10}
                value={[chunkSize]}
                onValueChange={(values) => setChunkSize(values[0])}
                data-testid="chunk-size-slider"
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>10</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 p-3 rounded-md border border-border/50">
              <Info className="h-4 w-4 shrink-0" />
              <p>
                This will create approximately{" "}
                <strong>{Math.ceil(skuCount / chunkSize)}</strong> chunks for{" "}
                {skuCount} selected SKUs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/50">
            <div className="space-y-3">
              <Label
                htmlFor="max-workers"
                className="text-base font-semibold flex items-center gap-2"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                Workers per Runner
              </Label>
              <p className="text-sm text-muted-foreground h-10">
                Number of concurrent headless browsers per machine.
              </p>
              <div className="relative">
                <Input
                  id="max-workers"
                  type="number"
                  min={1}
                  max={10}
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(parseInt(e.target.value) || 1)}
                  data-testid="max-workers-input"
                  className="pl-3 pr-12 font-mono"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground text-sm">
                  / 10
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="max-runners"
                className="text-base font-semibold flex items-center gap-2"
              >
                <Server className="h-4 w-4 text-muted-foreground" />
                Max Runners
              </Label>
              <p className="text-sm text-muted-foreground h-10">
                Total number of CI/CD runners to spawn (optional).
              </p>
              <Input
                id="max-runners"
                type="number"
                min={1}
                placeholder="Unlimited (blank)"
                value={maxRunners}
                onChange={(e) => setMaxRunners(e.target.value)}
                data-testid="max-runners-input"
                className="font-mono"
              />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-border/50 pt-6">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={!onBack}
          className="w-24"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          data-testid="enrichment-next-button"
          className="min-w-[120px]"
        >
          Review & Submit
        </Button>
      </CardFooter>
    </Card>
  );
}
