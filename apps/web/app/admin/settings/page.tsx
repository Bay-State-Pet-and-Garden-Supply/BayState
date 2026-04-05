import { AIScrapingSettingsCard } from "@/components/admin/settings/AIScrapingSettingsCard";
import { AIConsolidationSettingsCard } from "@/components/admin/settings/AIConsolidationSettingsCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage shared credentials and Gemini-first integration settings.
        </p>
      </div>

      <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-950 [&>svg]:text-emerald-700">
        <Sparkles className="h-4 w-4" />
        <AlertTitle>AI provider migration complete</AlertTitle>
        <AlertDescription>
          Scraping and consolidation settings now run on Gemini. OpenAI and
          SerpAPI credentials have been removed from this admin UI, and Brave
          Search has been deprecated in favor of Gemini-powered discovery.
        </AlertDescription>
      </Alert>

      <ShopSiteCredentialsCard />
      <AIScrapingSettingsCard />
      <AIConsolidationSettingsCard />
    </div>
  );
}
