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

      // Handler map — keeps tool dispatch in sync with the type system.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers: Record<ClientToolName, (input: any) => Promise<any>> = {
        listWorkspaceProducts: onListWorkspaceProducts,
        previewProductScope: onPreviewProductScope,
        getProductSnapshot: onGetProductSnapshot,
        inspectSourceData: onInspectSourceData,
        listImageSources: onListImageSources,
        setProductFields: onSetProductFields,
        bulkSetProductFields: onBulkSetProductFields,
        bulkTransformProductNames: onBulkTransformProductNames,
        assignBrand: onAssignBrand,
        bulkAssignBrand: onBulkAssignBrand,
        createBrand: onCreateBrand,
        setStorePages: onSetStorePages,
        addStorePages: onAddStorePages,
        removeStorePages: onRemoveStorePages,
        bulkUpdateStorePages: onBulkUpdateStorePages,
        replaceSelectedImages: onReplaceSelectedImages,
        addSelectedImages: onAddSelectedImages,
        removeSelectedImages: onRemoveSelectedImages,
        restoreSavedDraft: onRestoreSavedDraft,
        saveDraft: onSaveDraft,
        saveProducts: onSaveProducts,
        approveProduct: onApproveProduct,
        approveProducts: onApproveProducts,
        rejectProduct: onRejectProduct,
        rejectProducts: onRejectProducts,
      };

      const toolName = toolCall.toolName as string;
      const handler = handlers[toolName as ClientToolName];

      if (!handler) {
        return;
      }

      try {
        const output = await handler(toolCall.input);
        void addToolOutput({
          tool: toolName as ClientToolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      } catch (toolError) {
        void addToolOutput({
          tool: toolName as ClientToolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText:
            toolError instanceof Error
              ? toolError.message
              : "The copilot tool failed.",
        });
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
          className="rounded-none border border-border bg-muted px-3 py-2 text-[10px] font-semibold text-muted-foreground"
        >
          {label}...
        </div>
      );
    }

    if (part.state === "output-error") {
      return (
        <div
          key={key}
          className="rounded-none border border-red-600 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600"
        >
          <div className="font-bold">{label}</div>
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
          className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <div className="mb-2 font-semibold">{label}</div>
          {summary && (
            <div className="mb-2 whitespace-pre-wrap text-[10px] font-semibold text-muted-foreground">
              {summary}
            </div>
          )}
          <div className="space-y-2">
            {part.output.products.length === 0 ? (
              <span className="text-[10px] font-semibold text-muted-foreground">No matching products.</span>
            ) : (
              part.output.products.map((product) =>
                isRecord(product) && typeof product.sku === "string" ? (
                  <div
                    key={product.sku}
                    className="rounded-none border border-border bg-muted px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                        {product.sku}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {product.selected === true && (
                          <Badge variant="secondary" className="rounded-none border border-border bg-foreground text-background text-[8px] font-semibold">Selected</Badge>
                        )}
                        {product.dirty === true && (
                          <Badge variant="outline" className="rounded-none border border-border bg-amber-100 text-amber-950 text-[8px] font-semibold">Unsaved</Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold">
                      {typeof product.name === "string" && product.name
                        ? product.name
                        : "Untitled Product"}
                    </div>
                    <div className="mt-1 text-[9px] font-semibold text-muted-foreground">
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
          className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <div className="mb-1 font-semibold">{label}</div>
          <div className="whitespace-pre-wrap text-[10px] font-semibold text-muted-foreground">
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
          className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <div className="mb-2 font-semibold">{label}</div>
          <div className="flex flex-wrap gap-2">
            {part.output.brands.length === 0 ? (
              <span className="text-[10px] font-semibold text-muted-foreground">No matching brands.</span>
            ) : (
              part.output.brands.map((brand) =>
                isRecord(brand) && typeof brand.name === "string" ? (
                  <Badge key={String(brand.id)} variant="outline" className="rounded-none border border-border bg-muted text-foreground text-[9px] font-semibold">
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
          className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <div className="mb-2 font-semibold">{label}</div>
          <div className="space-y-2">
            {part.output.sources.map((source) =>
              isRecord(source) && typeof source.label === "string" ? (
                <div key={String(source.sourceKey)} className="text-[10px] font-semibold text-muted-foreground">
                  <span className="text-foreground">{source.label}</span>
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
          className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <div className="mb-2 font-semibold">{label}</div>
          <pre className="overflow-x-auto rounded-none border border-border bg-muted px-3 py-2 text-[10px] font-bold text-foreground/80">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div
        key={key}
        className="rounded-none border border-border bg-card px-3 py-2 text-xs text-foreground"
      >
        <div className="mb-2 font-semibold">{label}</div>
        <pre className="overflow-x-auto rounded-none border border-border bg-muted px-3 py-2 text-[10px] font-bold text-foreground/80">
          {JSON.stringify(part.output, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col bg-card">
      <div className="border-b border-border px-4 py-3 bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-none border border-border bg-foreground text-background">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Finalization Copilot</div>
              <div className="text-[10px] font-semibold text-muted-foreground">
                AI assistance for finalizing products.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant="outline" className="text-[9px] font-semibold rounded-none border border-border bg-muted text-foreground">
              {workspaceProductCount} in finalizing
            </Badge>
            <Badge variant="outline" className="text-[9px] font-semibold rounded-none border border-border bg-muted text-foreground">
              {dirtyProductCount} unsaved
            </Badge>
            <Badge variant="outline" className="text-[9px] font-semibold rounded-none border border-border bg-foreground text-background">
              {selectedSku ?? "No Product Selected"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none hover:bg-muted text-foreground"
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

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-muted/10">
        {hasPendingCopilotReview && (
          <Alert className="mb-4 border border-border bg-violet-50 text-violet-950 rounded-none">
            <AlertTitle className="font-semibold text-xs">Copilot changes are ready for review</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs font-semibold">
                {pendingCopilotReviewCount} product
                {pendingCopilotReviewCount === 1 ? "" : "s"} have staged
                copilot edits. Accept autosaves them; reject restores the
                previous drafts.
              </p>
              <div className="space-y-1">
                {pendingCopilotSummaries.slice(-3).map((summary) => (
                  <div key={summary} className="text-[10px] font-semibold text-muted-foreground">
                    - {summary}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none border border-border bg-foreground text-background font-semibold text-[10px] hover:bg-foreground/80 active:translate-x-[1px] active:translate-y-[1px]"
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
                  className="rounded-none border border-border bg-card text-foreground font-semibold text-[10px] hover:bg-muted active:translate-x-[1px] active:translate-y-[1px]"
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
            <div className="rounded-none border border-dashed border-border/20 bg-card px-4 py-5 text-sm font-semibold text-muted-foreground text-center">
              Ask the copilot to inspect the selected product, preview a scope
              across finalizing, and stage changes for review.
            </div>

            <div className="grid gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs font-semibold rounded-none border border-border bg-card hover:bg-muted active:translate-x-[1px] active:translate-y-[1px] transition-all"
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-none border border-border bg-foreground text-background shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[92%] rounded-none px-4 py-3 text-sm border border-border",
                      message.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-card text-foreground"
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
              <div className="rounded-none border border-red-600 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                Something went wrong while talking to the copilot.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-4 bg-card">
        {(status === "submitted" || status === "streaming") && (
          <div className="mb-3 flex items-center justify-between rounded-none border border-border bg-muted px-3 py-2 text-[10px] font-semibold text-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status === "submitted" ? "Submitting..." : "Working..."}
            </div>

            <Button 
              type="button" 
              variant="ghost" 
              size="sm" 
              onClick={stop}
              className="h-6 px-2 rounded-none hover:bg-muted text-foreground font-semibold text-[9px]"
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
            className="min-h-28 resize-none rounded-none border border-border focus-visible:ring-border font-bold"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold text-muted-foreground max-w-[70%]">
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
              className="rounded-none border border-border bg-foreground text-background font-semibold hover:bg-foreground/80 active:translate-x-[1px] active:translate-y-[1px] transition-all"
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
