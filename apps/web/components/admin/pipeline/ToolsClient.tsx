"use client";

import {
  FileSpreadsheet,
  FileJson,
  Image as ImageIcon,
} from "lucide-react";
import {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
} from "@/components/admin/admin-card";
import { PipelineToolActions } from "./PipelineToolActions";

export function ToolsClient() {
  return (
    <div className="space-y-6">
      <AdminCard variant="panel">
        <AdminCardHeader>
          <div className="rounded-lg bg-primary/10 p-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <AdminCardTitle>Quick Actions</AdminCardTitle>
            <AdminCardDescription>
              Access common pipeline operations for managing your product data.
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <PipelineToolActions />
        </AdminCardContent>
      </AdminCard>

      <div className="grid gap-6 md:grid-cols-3">
        <AdminCard variant="surface">
          <AdminCardHeader>
            <div className="rounded-lg bg-brand-forest-green/10 p-2">
              <FileSpreadsheet className="h-5 w-5 text-brand-forest-green" />
            </div>
            <div>
              <AdminCardTitle>Import Products</AdminCardTitle>
              <AdminCardDescription>
                Import products from Integra or CSV files.
              </AdminCardDescription>
            </div>
          </AdminCardHeader>
        </AdminCard>

        <AdminCard variant="surface">
          <AdminCardHeader>
            <div className="rounded-lg bg-brand-burgundy/10 p-2">
              <FileJson className="h-5 w-5 text-brand-burgundy" />
            </div>
            <div>
              <AdminCardTitle>Export Data</AdminCardTitle>
              <AdminCardDescription>
                Export products to CSV or JSON format.
              </AdminCardDescription>
            </div>
          </AdminCardHeader>
        </AdminCard>

        <AdminCard variant="surface">
          <AdminCardHeader>
            <div className="rounded-lg bg-brand-gold/10 p-2">
              <ImageIcon className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <AdminCardTitle>Image Manager</AdminCardTitle>
              <AdminCardDescription>
                Bulk upload and manage product images.
              </AdminCardDescription>
            </div>
          </AdminCardHeader>
        </AdminCard>
      </div>
    </div>
  );
}
