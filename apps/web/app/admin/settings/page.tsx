import { AIScrapingSettingsCard } from "@/components/admin/settings/AIScrapingSettingsCard";
import { AIConsolidationSettingsCard } from "@/components/admin/settings/AIConsolidationSettingsCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-black uppercase tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage shared credentials and OpenAI-powered external integrations.
        </p>
      </div>

      <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-950 [&>svg]:text-emerald-700">
        <Brain className="h-4 w-4" />
        <AlertTitle>External AI stack finalized</AlertTitle>
        <AlertDescription>
          Scraping and consolidation now run on OpenAI, with Serper handling
          discovery search. Legacy Gemini, Brave Search, and SerpAPI credentials
          are deprecated across the active admin flow.
        </AlertDescription>
      </Alert>

      <ShopSiteCredentialsCard />
      <AIScrapingSettingsCard />
      <AIConsolidationSettingsCard />
    </div>
  );
}
