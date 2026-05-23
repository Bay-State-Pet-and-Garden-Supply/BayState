import { AIProviderProfilesCard } from "@/components/admin/settings/AIProviderProfilesCard";
import { ConsolidationAISettingsCard } from "@/components/admin/settings/ConsolidationAISettingsCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";
import { DistributorCredentialsCard } from "@/components/admin/settings/DistributorCredentialsCard";
import { SearchCredentialsCard } from "@/components/admin/settings/SearchCredentialsCard";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, Settings, Layers } from "lucide-react";

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
        <Layers className="h-4 w-4" />
        <AlertTitle>Independent AI Provider Assignment</AlertTitle>
        <AlertDescription>
          You can now assign different profiles for extraction and consolidation. Each profile can be activated for extraction, consolidation, or both — giving you independent control over which model powers each pipeline stage. Use the card below to manage profiles, then set the consolidation model override in the Consolidation AI Settings card.
        </AlertDescription>
      </Alert>

      <ShopSiteCredentialsCard />
      <DistributorCredentialsCard />
      <SearchCredentialsCard />
      <AIProviderProfilesCard />
      <ConsolidationAISettingsCard />
    </AdminPageShell>
  );
}
