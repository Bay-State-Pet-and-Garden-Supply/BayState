import { AIScrapingCredentialsCard } from "@/components/admin/settings/AIScrapingCredentialsCard";
import { ShopSiteCredentialsCard } from "@/components/admin/settings/ShopSiteCredentialsCard";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage shared credentials and integration settings.
        </p>
      </div>

      <ShopSiteCredentialsCard />
      <AIScrapingCredentialsCard />
    </div>
  );
}
