import { AIProviderProfilesCard } from "@/components/admin/settings/AIProviderProfilesCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";
import { DistributorCredentialsCard } from "@/components/admin/settings/DistributorCredentialsCard";
import { SearchCredentialsCard } from "@/components/admin/settings/SearchCredentialsCard";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, Settings } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <AdminPageShell
      title="Settings"
      description="Manage shared credentials, AI providers, and the system settings the rest of the admin depends on."
      icon={<Settings className="h-5 w-5" />}
      eyebrow="System workspace"
      contentClassName="space-y-6"
    >
      <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-950 [&>svg]:text-emerald-700">
        <Brain className="h-4 w-4" />
        <AlertTitle>Dynamic AI Provider Stack</AlertTitle>
        <AlertDescription>
          Your AI provider profiles are now dynamic. Select any profile to set it active; that active profile will automatically drive scraping, consolidation, and the Finalization Copilot.
        </AlertDescription>
      </Alert>

      <ShopSiteCredentialsCard />
      <DistributorCredentialsCard />
      <SearchCredentialsCard />
      <AIProviderProfilesCard />
    </AdminPageShell>
  );
}
