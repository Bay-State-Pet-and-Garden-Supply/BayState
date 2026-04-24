"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
  Bot,
  Loader2,
  SendHorizonal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FinalizationCopilotUIMessage } from "@/lib/agents/finalization-copilot-agent";
import type {
  AddSelectedImagesInput,
  ApproveProductInput,
  AssignBrandInput,
  BulkAssignBrandInput,
  BulkTransformProductNamesInput,
  BulkSetProductFieldsInput,
  BulkStorePagesInput,
  CreateBrandInput,
  InspectSourceDataInput,
  InspectSourceDataOutput,
  ListImageSourcesInput,
  ListImageSourcesOutput,
  ListWorkspaceProductsInput,
  ListWorkspaceProductsOutput,
  PreviewProductScopeInput,
  PreviewProductScopeOutput,
  ProductSnapshotInput,
  ProductSnapshotOutput,
  RejectProductInput,
  RemoveSelectedImagesInput,
  RemoveStorePagesInput,
  ReplaceSelectedImagesInput,
  RestoreSavedDraftInput,
  SaveDraftInput,
  ScopedProductActionInput,
  ScopedRejectProductInput,
  SetProductFieldsInput,
  SetStorePagesInput,
  ToolSummary,
} from "@/lib/tools/finalization-copilot";
import type { FinalizationCopilotContext } from "@/lib/pipeline/finalization-copilot-workspace";

const TERMINAL_TOOL_NAMES = new Set([
  "approveProduct",
  "rejectProduct",
  "approveProducts",
  "rejectProducts",
]);

const TOOL_LABELS: Record<string, string> = {
  listWorkspaceProducts: "Listing workspace",
  previewProductScope: "Previewing scope",
  getProductSnapshot: "Reviewing draft",
  inspectSourceData: "Inspecting source",
  listImageSources: "Reviewing images",
  searchBrands: "Searching brands",
  setProductFields: "Updating fields",
  bulkSetProductFields: "Updating products",
  bulkTransformProductNames: "Updating names",
  assignBrand: "Assigning brand",
  bulkAssignBrand: "Assigning brands",
  createBrand: "Creating brand",
  setStorePages: "Setting store pages",
  addStorePages: "Adding store pages",
  removeStorePages: "Removing store pages",
  bulkUpdateStorePages: "Updating store pages",
  replaceSelectedImages: "Replacing images",
  addSelectedImages: "Adding images",
  removeSelectedImages: "Removing images",
  restoreSavedDraft: "Restoring saved draft",
  saveDraft: "Saving draft",
  saveProducts: "Saving products",
  approveProduct: "Approving product",
  approveProducts: "Approving products",
  rejectProduct: "Rejecting product",
  rejectProducts: "Rejecting products",
};

const STARTER_PROMPTS = [
  "Tighten the product title for clarity.",
  "List the products in finalizing, then tell me which ones look risky or incomplete.",
  "Preview a workspace-wide change that updates availability text across all finalizing products.",
  "Check the scraped sources and assign the best matching brand for the selected draft.",
  "Append Seed Packet to product names that need it without replacing the rest of the name.",
  "Review the image sources and stage the strongest set of images for review.",
  "Audit the selected draft for anything risky before approval.",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

function extractSummary(output: unknown): string | null {
  if (!isRecord(output)) {
    return null;
  }

  return typeof output.summary === "string" ? output.summary : null;
}

function isToolOutputState(
  state: string,
): state is "output-available" | "output-error" {
  return state === "output-available" || state === "output-error";
}

function shouldAutoSendAfterTools({
  messages,
}: {
  messages: FinalizationCopilotUIMessage[];
}): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    return false;
  }

  const message = messages[messages.length - 1];
  if (!message || message.role !== "assistant") {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === "step-start" ? index : lastIndex;
  }, -1);

  return !message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart)
    .filter((part) => !part.providerExecuted && isToolOutputState(part.state))
    .some((part) => TERMINAL_TOOL_NAMES.has(getToolName(part)));
}

interface FinalizationCopilotPanelProps {
  selectedSku: string | null;
  workspaceProductCount: number;
  dirtyProductCount: number;
  hasPendingCopilotReview: boolean;
  pendingCopilotReviewCount: number;
  pendingCopilotSummaries: string[];
  reviewActionPending: boolean;
  getContext: () => FinalizationCopilotContext;
  onAcceptPendingCopilotReview: () => Promise<void>;
  onRejectPendingCopilotReview: () => void;
  onListWorkspaceProducts: (
    input: ListWorkspaceProductsInput,
  ) => Promise<ListWorkspaceProductsOutput>;
  onPreviewProductScope: (
    input: PreviewProductScopeInput,
  ) => Promise<PreviewProductScopeOutput>;
  onGetProductSnapshot: (
    input: ProductSnapshotInput,
  ) => Promise<ProductSnapshotOutput>;
  onInspectSourceData: (
    input: InspectSourceDataInput,
  ) => Promise<InspectSourceDataOutput>;
  onListImageSources: (
    input: ListImageSourcesInput,
  ) => Promise<ListImageSourcesOutput>;
  onSetProductFields: (
    input: SetProductFieldsInput,
  ) => Promise<ToolSummary>;
  onBulkSetProductFields: (
    input: BulkSetProductFieldsInput,
  ) => Promise<ToolSummary>;
  onBulkTransformProductNames: (
    input: BulkTransformProductNamesInput,
  ) => Promise<ToolSummary>;
  onAssignBrand: (input: AssignBrandInput) => Promise<ToolSummary>;
  onBulkAssignBrand: (input: BulkAssignBrandInput) => Promise<ToolSummary>;
  onCreateBrand: (input: CreateBrandInput) => Promise<ToolSummary>;
  onSetStorePages: (input: SetStorePagesInput) => Promise<ToolSummary>;
  onAddStorePages: (input: SetStorePagesInput) => Promise<ToolSummary>;
  onRemoveStorePages: (
    input: RemoveStorePagesInput,
  ) => Promise<ToolSummary>;
  onBulkUpdateStorePages: (
    input: BulkStorePagesInput,
  ) => Promise<ToolSummary>;
  onReplaceSelectedImages: (
    input: ReplaceSelectedImagesInput,
  ) => Promise<ToolSummary>;
  onAddSelectedImages: (
    input: AddSelectedImagesInput,
  ) => Promise<ToolSummary>;
  onRemoveSelectedImages: (
    input: RemoveSelectedImagesInput,
  ) => Promise<ToolSummary>;
  onRestoreSavedDraft: (
    input: RestoreSavedDraftInput,
  ) => Promise<ToolSummary>;
  onSaveDraft: (input: SaveDraftInput) => Promise<ToolSummary>;
  onSaveProducts: (input: ScopedProductActionInput) => Promise<ToolSummary>;
  onApproveProduct: (
    input: ApproveProductInput,
  ) => Promise<ToolSummary>;
  onApproveProducts: (
    input: ScopedProductActionInput,
  ) => Promise<ToolSummary>;
  onRejectProduct: (input: RejectProductInput) => Promise<ToolSummary>;
  onRejectProducts: (
    input: ScopedRejectProductInput,
  ) => Promise<ToolSummary>;
}

type ClientToolName =
  | "listWorkspaceProducts"
  | "previewProductScope"
  | "getProductSnapshot"
  | "inspectSourceData"
  | "listImageSources"
  | "setProductFields"
  | "bulkSetProductFields"
  | "bulkTransformProductNames"
  | "assignBrand"
  | "bulkAssignBrand"
  | "createBrand"
  | "setStorePages"
  | "addStorePages"
  | "removeStorePages"
  | "bulkUpdateStorePages"
  | "replaceSelectedImages"
  | "addSelectedImages"
  | "removeSelectedImages"
  | "restoreSavedDraft"
  | "saveDraft"
  | "saveProducts"
  | "approveProduct"
  | "approveProducts"
  | "rejectProduct"
  | "rejectProducts";

export function FinalizationCopilotPanel({
  selectedSku,
  workspaceProductCount,
  dirtyProductCount,
  hasPendingCopilotReview,
  pendingCopilotReviewCount,
  pendingCopilotSummaries,
  reviewActionPending,
  getContext,
  onAcceptPendingCopilotReview,
  onRejectPendingCopilotReview,
  onListWorkspaceProducts,
  onPreviewProductScope,
  onGetProductSnapshot,
  onInspectSourceData,
  onListImageSources,
  onSetProductFields,
  onBulkSetProductFields,
  onBulkTransformProductNames,
  onAssignBrand,
  onBulkAssignBrand,
  onCreateBrand,
  onSetStorePages,
  onAddStorePages,
  onRemoveStorePages,
  onBulkUpdateStorePages,
  onReplaceSelectedImages,
  onAddSelectedImages,
  onRemoveSelectedImages,
  onRestoreSavedDraft,
  onSaveDraft,
  onSaveProducts,
  onApproveProduct,
  onApproveProducts,
  onRejectProduct,
  onRejectProducts,
}: FinalizationCopilotPanelProps) {
  const [input, setInput] = useState("");

  const {
    addToolOutput,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<FinalizationCopilotUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/admin/pipeline/finalization-copilot",
      body: () => ({ context: getContext() }),
    }),
    sendAutomaticallyWhen: shouldAutoSendAfterTools,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) {
        return;
      }

      const addToolError = (tool: ClientToolName, errorText: string) => {
        void addToolOutput({
          tool,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText,
        });
      };

      const fail = (errorText: string) => {
        switch (toolCall.toolName) {
          case "listWorkspaceProducts":
            addToolError("listWorkspaceProducts", errorText);
            break;
          case "previewProductScope":
            addToolError("previewProductScope", errorText);
            break;
          case "getProductSnapshot":
            addToolError("getProductSnapshot", errorText);
            break;
          case "inspectSourceData":
            addToolError("inspectSourceData", errorText);
            break;
          case "listImageSources":
            addToolError("listImageSources", errorText);
            break;
          case "setProductFields":
            addToolError("setProductFields", errorText);
            break;
          case "bulkSetProductFields":
            addToolError("bulkSetProductFields", errorText);
            break;
          case "bulkTransformProductNames":
            addToolError("bulkTransformProductNames", errorText);
            break;
          case "assignBrand":
            addToolError("assignBrand", errorText);
            break;
          case "bulkAssignBrand":
            addToolError("bulkAssignBrand", errorText);
            break;
          case "createBrand":
            addToolError("createBrand", errorText);
            break;
          case "setStorePages":
            addToolError("setStorePages", errorText);
            break;
          case "addStorePages":
            addToolError("addStorePages", errorText);
            break;
          case "removeStorePages":
            addToolError("removeStorePages", errorText);
            break;
          case "bulkUpdateStorePages":
            addToolError("bulkUpdateStorePages", errorText);
            break;
          case "replaceSelectedImages":
            addToolError("replaceSelectedImages", errorText);
            break;
          case "addSelectedImages":
            addToolError("addSelectedImages", errorText);
            break;
          case "removeSelectedImages":
            addToolError("removeSelectedImages", errorText);
            break;
          case "restoreSavedDraft":
            addToolError("restoreSavedDraft", errorText);
            break;
          case "saveDraft":
            addToolError("saveDraft", errorText);
            break;
          case "saveProducts":
            addToolError("saveProducts", errorText);
            break;
          case "approveProduct":
            addToolError("approveProduct", errorText);
            break;
          case "approveProducts":
            addToolError("approveProducts", errorText);
            break;
          case "rejectProduct":
            addToolError("rejectProduct", errorText);
            break;
          case "rejectProducts":
            addToolError("rejectProducts", errorText);
            break;
          default:
            break;
        }
      };

      try {
        switch (toolCall.toolName) {
          case "listWorkspaceProducts": {
            const output = await onListWorkspaceProducts(toolCall.input);
            void addToolOutput({
              tool: "listWorkspaceProducts",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "previewProductScope": {
            const output = await onPreviewProductScope(toolCall.input);
            void addToolOutput({
              tool: "previewProductScope",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "getProductSnapshot": {
            const output = await onGetProductSnapshot(toolCall.input);
            void addToolOutput({
              tool: "getProductSnapshot",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "inspectSourceData": {
            const output = await onInspectSourceData(toolCall.input);
            void addToolOutput({
              tool: "inspectSourceData",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "listImageSources": {
            const output = await onListImageSources(toolCall.input);
            void addToolOutput({
              tool: "listImageSources",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "setProductFields": {
            const output = await onSetProductFields(toolCall.input);
            void addToolOutput({
              tool: "setProductFields",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "bulkSetProductFields": {
            const output = await onBulkSetProductFields(toolCall.input);
            void addToolOutput({
              tool: "bulkSetProductFields",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "bulkTransformProductNames": {
            const output = await onBulkTransformProductNames(toolCall.input);
            void addToolOutput({
              tool: "bulkTransformProductNames",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "assignBrand": {
            const output = await onAssignBrand(toolCall.input);
            void addToolOutput({
              tool: "assignBrand",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "bulkAssignBrand": {
            const output = await onBulkAssignBrand(toolCall.input);
            void addToolOutput({
              tool: "bulkAssignBrand",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "createBrand": {
            const output = await onCreateBrand(toolCall.input);
            void addToolOutput({
              tool: "createBrand",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "setStorePages": {
            const output = await onSetStorePages(toolCall.input);
            void addToolOutput({
              tool: "setStorePages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "addStorePages": {
            const output = await onAddStorePages(toolCall.input);
            void addToolOutput({
              tool: "addStorePages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "removeStorePages": {
            const output = await onRemoveStorePages(toolCall.input);
            void addToolOutput({
              tool: "removeStorePages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "bulkUpdateStorePages": {
            const output = await onBulkUpdateStorePages(toolCall.input);
            void addToolOutput({
              tool: "bulkUpdateStorePages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "replaceSelectedImages": {
            const output = await onReplaceSelectedImages(toolCall.input);
            void addToolOutput({
              tool: "replaceSelectedImages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "addSelectedImages": {
            const output = await onAddSelectedImages(toolCall.input);
            void addToolOutput({
              tool: "addSelectedImages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "removeSelectedImages": {
            const output = await onRemoveSelectedImages(toolCall.input);
            void addToolOutput({
              tool: "removeSelectedImages",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "restoreSavedDraft": {
            const output = await onRestoreSavedDraft(toolCall.input);
            void addToolOutput({
              tool: "restoreSavedDraft",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "saveDraft": {
            const output = await onSaveDraft(toolCall.input);
            void addToolOutput({
              tool: "saveDraft",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "saveProducts": {
            const output = await onSaveProducts(toolCall.input);
            void addToolOutput({
              tool: "saveProducts",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "approveProduct": {
            const output = await onApproveProduct(toolCall.input);
            void addToolOutput({
              tool: "approveProduct",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "approveProducts": {
            const output = await onApproveProducts(toolCall.input);
            void addToolOutput({
              tool: "approveProducts",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "rejectProduct": {
            const output = await onRejectProduct(toolCall.input);
            void addToolOutput({
              tool: "rejectProduct",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          case "rejectProducts": {
            const output = await onRejectProducts(toolCall.input);
            void addToolOutput({
              tool: "rejectProducts",
              toolCallId: toolCall.toolCallId,
              output,
            });
            return;
          }

          default:
            return;
        }
      } catch (toolError) {
        fail(
          toolError instanceof Error
            ? toolError.message
            : "The copilot tool failed.",
        );
      }
    },
  });

  const handleSubmit = () => {
    if (
      workspaceProductCount === 0
      || hasPendingCopilotReview
      || !input.trim()
      || status !== "ready"
    ) {
      return;
    }

    sendMessage({ text: input.trim() });
    setInput("");
  };

  const renderToolPart = (
    part: Extract<FinalizationCopilotUIMessage["parts"][number], { type: string }>,
    index: number,
  ) => {
    if (!isToolUIPart(part)) {
      return null;
    }

    const key = `${part.toolCallId}-${index}`;
    const toolName = getToolName(part);
    const label = getToolLabel(toolName);

    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-tighter text-zinc-500 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          {label}...
        </div>
      );
    }

    if (part.state === "output-error") {
      return (
        <div
          key={key}
          className="rounded-none border border-red-600 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-tighter text-red-600 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="font-black">{label}</div>
          <div className="mt-1">{part.errorText}</div>
        </div>
      );
    }

    if (
      (toolName === "listWorkspaceProducts" || toolName === "previewProductScope")
      && isRecord(part.output)
      && Array.isArray(part.output.products)
    ) {
      const summary = extractSummary(part.output);

      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-2 font-black uppercase tracking-tighter">{label}</div>
          {summary && (
            <div className="mb-2 whitespace-pre-wrap text-[10px] font-black uppercase tracking-tighter text-zinc-500">
              {summary}
            </div>
          )}
          <div className="space-y-2">
            {part.output.products.length === 0 ? (
              <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-400">No matching products.</span>
            ) : (
              part.output.products.map((product) =>
                isRecord(product) && typeof product.sku === "string" ? (
                  <div
                    key={product.sku}
                    className="rounded-none border border-zinc-950 bg-zinc-50 px-3 py-2 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-[10px] text-zinc-500 uppercase tracking-tighter">
                        {product.sku}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {product.selected === true && (
                          <Badge variant="secondary" className="rounded-none border border-zinc-950 bg-zinc-950 text-white text-[8px] font-black uppercase tracking-tighter">Selected</Badge>
                        )}
                        {product.dirty === true && (
                          <Badge variant="outline" className="rounded-none border border-zinc-950 bg-amber-100 text-amber-950 text-[8px] font-black uppercase tracking-tighter">Unsaved</Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] font-black uppercase tracking-tighter">
                      {typeof product.name === "string" && product.name
                        ? product.name
                        : "Untitled Product"}
                    </div>
                    <div className="mt-1 text-[9px] font-black uppercase tracking-tighter text-zinc-500">
                      {typeof product.price === "string" && product.price
                        ? `$${product.price}`
                        : "No price"}
                      {" • "}
                      {typeof product.confidenceScore === "number"
                        ? `Confidence ${Math.round(product.confidenceScore * 100)}%`
                        : "No confidence score"}
                      {" • "}
                      {typeof product.storePageCount === "number"
                        ? `${product.storePageCount} pages`
                        : "No pages"}
                    </div>
                  </div>
                ) : null,
              )
            )}
          </div>
        </div>
      );
    }

    const summary = extractSummary(part.output);

    if (summary) {
      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-1 font-black uppercase tracking-tighter">{label}</div>
          <div className="whitespace-pre-wrap text-[10px] font-black uppercase tracking-tighter text-zinc-500">
            {summary}
          </div>
        </div>
      );
    }

    if (
      toolName === "searchBrands"
      && isRecord(part.output)
      && Array.isArray(part.output.brands)
    ) {
      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-2 font-black uppercase tracking-tighter">{label}</div>
          <div className="flex flex-wrap gap-2">
            {part.output.brands.length === 0 ? (
              <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-400">No matching brands.</span>
            ) : (
              part.output.brands.map((brand) =>
                isRecord(brand) && typeof brand.name === "string" ? (
                  <Badge key={String(brand.id)} variant="outline" className="rounded-none border border-zinc-950 bg-zinc-100 text-zinc-950 text-[9px] font-black uppercase tracking-tighter">
                    {brand.name}
                  </Badge>
                ) : null,
              )
            )}
          </div>
        </div>
      );
    }

    if (
      toolName === "listImageSources"
      && isRecord(part.output)
      && Array.isArray(part.output.sources)
    ) {
      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-2 font-black uppercase tracking-tighter">{label}</div>
          <div className="space-y-2">
            {part.output.sources.map((source) =>
              isRecord(source) && typeof source.label === "string" ? (
                <div key={String(source.sourceKey)} className="text-[10px] font-black uppercase tracking-tighter text-zinc-500">
                  <span className="text-zinc-950">{source.label}</span>
                  {" - "}
                  {typeof source.candidateCount === "number"
                    ? `${source.candidateCount} candidates`
                    : "Candidates available"}
                </div>
              ) : null,
            )}
          </div>
        </div>
      );
    }

    if (
      (toolName === "inspectSourceData"
        || toolName === "getProductSnapshot")
      && isRecord(part.output)
    ) {
      return (
        <div
          key={key}
          className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-2 font-black uppercase tracking-tighter">{label}</div>
          <pre className="overflow-x-auto rounded-none border border-zinc-950 bg-zinc-50 px-3 py-2 text-[10px] font-bold text-zinc-700">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div
        key={key}
        className="rounded-none border border-zinc-950 bg-white px-3 py-2 text-xs text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
      >
        <div className="mb-2 font-black uppercase tracking-tighter">{label}</div>
        <pre className="overflow-x-auto rounded-none border border-zinc-950 bg-zinc-50 px-3 py-2 text-[10px] font-bold text-zinc-700">
          {JSON.stringify(part.output, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col bg-white">
      <div className="border-b border-zinc-950 px-4 py-3 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-none border border-zinc-950 bg-zinc-950 text-white shadow-[1px_1px_0px_rgba(0,0,0,1)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-tighter text-zinc-950">Finalization Copilot</div>
              <div className="text-[10px] font-black uppercase tracking-tighter text-zinc-500">
                AI assistance for finalizing products.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter rounded-none border border-zinc-950 bg-zinc-100 text-zinc-950">
              {workspaceProductCount} in finalizing
            </Badge>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter rounded-none border border-zinc-950 bg-zinc-100 text-zinc-950">
              {dirtyProductCount} unsaved
            </Badge>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter rounded-none border border-zinc-950 bg-zinc-950 text-white">
              {selectedSku ?? "No Product Selected"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none hover:bg-zinc-100 text-zinc-950"
              onClick={() => {
                setMessages([]);
                setInput("");
              }}
              disabled={messages.length === 0}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Clear copilot chat</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50/50">
        {hasPendingCopilotReview && (
          <Alert className="mb-4 border border-zinc-950 bg-violet-50 text-violet-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <AlertTitle className="font-black uppercase tracking-tighter text-xs">Copilot changes are ready for review</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs font-black uppercase tracking-tighter">
                {pendingCopilotReviewCount} product
                {pendingCopilotReviewCount === 1 ? "" : "s"} have staged
                copilot edits. Accept autosaves them; reject restores the
                previous drafts.
              </p>
              <div className="space-y-1">
                {pendingCopilotSummaries.slice(-3).map((summary) => (
                  <div key={summary} className="text-[10px] font-black uppercase tracking-tighter text-zinc-600">
                    - {summary}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none border border-zinc-950 bg-zinc-950 text-white shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter text-[10px] hover:bg-zinc-800 active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                  onClick={() => {
                    void onAcceptPendingCopilotReview();
                  }}
                  disabled={reviewActionPending || status !== "ready"}
                >
                  Accept & Autosave
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none border border-zinc-950 bg-white text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter text-[10px] hover:bg-zinc-100 active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                  onClick={onRejectPendingCopilotReview}
                  disabled={reviewActionPending || status !== "ready"}
                >
                  Reject
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-none border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm font-black uppercase tracking-tighter text-zinc-400 text-center">
              Ask the copilot to inspect the selected product, preview a scope
              across finalizing, and stage changes for review.
            </div>

            <div className="grid gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs font-black uppercase tracking-tighter rounded-none border border-zinc-950 bg-white shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:bg-zinc-50 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
                  disabled={
                    workspaceProductCount === 0
                    || hasPendingCopilotReview
                    || status !== "ready"
                  }
                  onClick={() => {
                    if (
                      workspaceProductCount === 0
                      || hasPendingCopilotReview
                      || status !== "ready"
                    ) {
                      return;
                    }
                    sendMessage({ text: prompt });
                  }}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={`flex items-start gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role !== "user" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-none border border-zinc-950 bg-zinc-950 text-white shadow-[1px_1px_0px_rgba(0,0,0,1)] shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[92%] rounded-none px-4 py-3 text-sm border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]",
                      message.role === "user"
                        ? "bg-zinc-950 text-white"
                        : "bg-white text-zinc-950"
                    )}
                  >
                    <div className="space-y-3">
                      {message.parts.map((part, index) => {
                        if (part.type === "text") {
                          return (
                            <div
                              key={`${message.id}-text-${index}`}
                              className="whitespace-pre-wrap leading-6 font-bold"
                            >
                              {part.text}
                            </div>
                          );
                        }

                        return renderToolPart(part, index);
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-none border border-red-600 bg-red-50 px-3 py-2 text-xs font-black uppercase tracking-tighter text-red-600 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                Something went wrong while talking to the copilot.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-950 px-4 py-4 bg-white">
        {(status === "submitted" || status === "streaming") && (
          <div className="mb-3 flex items-center justify-between rounded-none border border-zinc-950 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-tighter text-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status === "submitted" ? "Submitting..." : "Working..."}
            </div>

            <Button 
              type="button" 
              variant="ghost" 
              size="sm" 
              onClick={stop}
              className="h-6 px-2 rounded-none hover:bg-zinc-200 text-zinc-950 font-black uppercase tracking-tighter text-[9px]"
            >
              <Square className="mr-1 h-3 w-3" />
              Stop
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              hasPendingCopilotReview
                ? "Accept or reject the staged copilot changes before sending another request."
                : workspaceProductCount > 0
                ? "Ask the copilot about the selected product or a scope across finalizing..."
                : "No products are loaded in finalizing."
            }
            disabled={
              workspaceProductCount === 0
              || hasPendingCopilotReview
              || status !== "ready"
            }
            className="min-h-28 resize-none rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-tighter text-zinc-400 max-w-[70%]">
              The copilot stages edits for review first. Accept autosaves the
              staged changes; reject restores the previous drafts.
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                workspaceProductCount === 0
                || hasPendingCopilotReview
                || !input.trim()
                || status !== "ready"
              }
              className="rounded-none border border-zinc-950 bg-zinc-950 text-white shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter hover:bg-zinc-800 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
            >
              <SendHorizonal className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
