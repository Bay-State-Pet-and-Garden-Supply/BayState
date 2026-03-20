"use client";

import {
  Upload,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  FileJson,
  Image,
} from "lucide-react";
import { PipelineToolActions } from "./PipelineToolActions";

export function ToolsClient() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Pipeline Tools
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Import products, export data, and manage product images.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          <p className="text-sm text-gray-600">
            Access common pipeline operations for managing your product data.
          </p>
        </div>

        <PipelineToolActions />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-forest-green/10 p-2">
              <FileSpreadsheet className="h-5 w-5 text-brand-forest-green" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Import Products
              </h2>
              <p className="text-sm text-gray-600">
                Import products from Integra or CSV files.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-burgundy/10 p-2">
              <FileJson className="h-5 w-5 text-brand-burgundy" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Export Data
              </h2>
              <p className="text-sm text-gray-600">
                Export products to CSV or JSON format.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-gold/10 p-2">
              <Image className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Image Manager
              </h2>
              <p className="text-sm text-gray-600">
                Bulk upload and manage product images.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
