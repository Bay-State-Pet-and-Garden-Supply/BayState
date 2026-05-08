import { AIScrapingSettingsCard } from "@/components/admin/settings/AIScrapingSettingsCard";
import { AIConsolidationSettingsCard } from "@/components/admin/settings/AIConsolidationSettingsCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, Settings } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <AdminPageShell
      title="Settings"
      description="Manage shared credentials and DeepSeek-powered external integrations."
      icon={<Settings className="h-5 w-5" />}
      contentClassName="space-y-6"
    >
      <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-950 [&>svg]:text-emerald-700">
        <Brain className="h-4 w-4" />
        <AlertTitle>External AI stack finalized</AlertTitle>
        <AlertDescription>
          Scraping, consolidation, and Finalization Copilot now run on DeepSeek,
          with Serper handling discovery search. Legacy Gemini, OpenAI, Brave
          Search, and SerpAPI credentials are deprecated across the active admin
          flow.
        </AlertDescription>
      </Alert>

      <ShopSiteCredentialsCard />
      <AIScrapingSettingsCard />
      <AIConsolidationSettingsCard />
    </AdminPageShell>
  );
}
