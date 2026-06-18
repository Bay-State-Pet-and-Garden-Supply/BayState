"use client";

import { useState, useEffect, useCallback } from "react";
import {
    ImageOff,
    ChevronRight,
    ChevronDown,
    Loader2,
    RotateCcw,
    Check,
    AlertTriangle,
    AlertCircle,
    Sparkles,
    Info,
} from "lucide-react";
import { toast } from "sonner";
import { adminFetch } from "@/lib/admin/api-client";

// =============================================================================
// Types
// =============================================================================

interface PackagingFacts {
    packaging_title?: string | null;
    brand?: string | null;
    product_line?: string | null;
    variant?: string | null;
    flavor?: string | null;
    color?: string | null;
    scent?: string | null;
    material?: string | null;
    product_type?: string | null;
    size?: string | null;
    weight?: string | null;
    count?: string | null;
    packaging_type?: string | null;
    claims?: string[];
}

interface FieldConfidence {
    [field: string]: number;
}

interface PackagingExtraction {
    id: string;
    upc: string;
    status: string;
    is_stale: boolean;
    image_urls: string[];
    raw_text: string | null;
    structured_facts: PackagingFacts;
    field_confidence: FieldConfidence;
    overall_confidence: number | null;
    conflicts: string[];
    provider: string;
    model: string | null;
    prompt_version: string;
    schema_version: string;
    completed_at: string | null;
    created_at: string;
}

interface TitleSuggestion {
    id: string;
    upc: string;
    packaging_extraction_id: string;
    title: string;
    confidence_score: number | null;
    mode: string;
    status: string;
    reasons: string[];
    conflicts: string[];
    applied_at: string | null;
    created_at: string;
}

interface PackagingEvidenceData {
    upc: string;
    extraction: PackagingExtraction | null;
    titleSuggestion: TitleSuggestion | null;
    draftTitle: string | null;
    hasPendingExtraction: boolean;
}

export interface PackagingEvidencePanelProps {
    upc: string;
    className?: string;
    onTitleApplied?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function formatConfidence(value: number | null | undefined): string {
    if (value === null || value === undefined) return "—";
    return `${(value * 100).toFixed(0)}%`;
}

function getConfidenceColor(value: number | null | undefined): string {
    if (value === null || value === undefined) return "text-muted-foreground";
    if (value >= 0.85) return "text-green-600";
    if (value >= 0.7) return "text-yellow-600";
    return "text-red-600";
}

function getConfidenceBadge(value: number | null | undefined): string {
    if (value === null || value === undefined) return "bg-muted text-muted-foreground";
    if (value >= 0.85) return "bg-green-100 text-green-800";
    if (value >= 0.7) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
}

function getModeBadge(mode: string | null | undefined): { label: string; className: string } {
    switch (mode) {
        case "auto_draft_high_confidence":
            return { label: "Auto", className: "bg-green-100 text-green-800" };
        case "suggestion":
            return { label: "Suggestion", className: "bg-blue-100 text-blue-800" };
        case "shadow":
            return { label: "Shadow", className: "bg-yellow-100 text-yellow-800" };
        default:
            return { label: "Disabled", className: "bg-muted text-muted-foreground" };
    }
}

const FACT_LABELS: Record<string, string> = {
    brand: "Brand",
    product_line: "Product Line",
    variant: "Variant",
    flavor: "Flavor",
    color: "Color",
    scent: "Scent",
    material: "Material",
    product_type: "Type",
    size: "Size",
    weight: "Weight",
    count: "Count",
    packaging_type: "Packaging Type",
    packaging_title: "Packaging Title",
};

// =============================================================================
// Component
// =============================================================================

export function PackagingEvidencePanel({
    upc,
    className = "",
    onTitleApplied,
}: PackagingEvidencePanelProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<PackagingEvidenceData | null>(null);
    const [rawTextOpen, setRawTextOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [rerunning, setRerunning] = useState(false);
    const [fetchToken, setFetchToken] = useState(0);

    const fetchEvidence = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminFetch(`/api/admin/packaging/${encodeURIComponent(upc)}`);
            if (!res.ok) {
                throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
            }
            const json = await res.json();
            setData(json);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [upc]);

    useEffect(() => {
        // Use a small timeout to avoid cascading render warnings
        const timer = setTimeout(() => {
            fetchEvidence();
        }, 0);
        return () => {
            clearTimeout(timer);
        };
    }, [fetchToken, upc, fetchEvidence]); // include upc so stale evidence is cleared when switching products

    const handleRerun = useCallback(async () => {
        setRerunning(true);
        try {
            const res = await adminFetch(`/api/admin/packaging/${encodeURIComponent(upc)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "rerun" }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to rerun extraction");
            }
            toast.success("Packaging extraction re-queued");
            setFetchToken((t) => t + 1);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            toast.error(message);
        } finally {
            setRerunning(false);
        }
    }, [upc]);

    const handleApplyTitle = useCallback(async () => {
        const suggestionId = data?.titleSuggestion?.id;
        if (!suggestionId || !data?.titleSuggestion?.title) return;

        setApplying(true);
        try {
            const res = await adminFetch(`/api/admin/packaging/${encodeURIComponent(upc)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "apply-suggestion", suggestion_id: suggestionId }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to apply title");
            }
            toast.success("Packaging title applied");
            onTitleApplied?.();
            setFetchToken((t) => t + 1);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            toast.error(message);
        } finally {
            setApplying(false);
        }
    }, [upc, data, onTitleApplied]);

    // ===========================================================================
    // Loading state
    // ===========================================================================
    if (loading) {
        return (
            <div className={`border border-border bg-card ${className}`}>
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Packaging Vision
                        </span>
                    </div>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
                <div className="flex items-center justify-center p-6 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-xs font-semibold">Loading packaging evidence&hellip;</span>
                </div>
            </div>
        );
    }

    // ===========================================================================
    // Error state
    // ===========================================================================
    if (error) {
        return (
            <div className={`border border-border bg-card ${className}`}>
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Packaging Vision
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-center p-6 text-destructive">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span className="text-xs font-semibold">Failed to load: {error}</span>
                </div>
            </div>
        );
    }

    const extraction = data?.extraction ?? null;
    const suggestion = data?.titleSuggestion ?? null;
    const draftTitle = data?.draftTitle ?? null;
    const hasPendingExtraction = data?.hasPendingExtraction ?? false;

    return (
        <div className={`border border-border bg-card ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Packaging Vision
                    </span>
                    {suggestion && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 ${getModeBadge(suggestion.mode).className}`}>
                            {getModeBadge(suggestion.mode).label}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRerun}
                        disabled={rerunning}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-muted-foreground bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50"
                        title="Rerun packaging extraction"
                    >
                        <RotateCcw className={`h-3 w-3 ${rerunning ? "animate-spin" : ""}`} />
                        {rerunning ? "Re-queuing…" : "Rerun"}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-3">
                {!extraction && !hasPendingExtraction && (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                        <ImageOff className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-xs font-semibold">No packaging evidence available.</p>
                        <p className="text-[10px] mt-1">Click &quot;Rerun&quot; to start a new extraction job.</p>
                    </div>
                )}

                {!extraction && hasPendingExtraction && (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
                        <p className="text-xs font-semibold">Packaging extraction in progress…</p>
                        <p className="text-[10px] mt-1">The self-hosted runner is processing images.</p>
                    </div>
                )}

                {extraction && (
                    <>
                        {/* Confidence Badge */}
                        {extraction.overall_confidence !== null && (
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Overall Confidence
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 ${getConfidenceBadge(extraction.overall_confidence)}`}>
                                    {formatConfidence(extraction.overall_confidence)}
                                </span>
                            </div>
                        )}

                        {/* Images used */}
                        {extraction.image_urls && extraction.image_urls.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Packaging Image{extraction.image_urls.length > 1 ? "s" : ""}
                                </span>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {extraction.image_urls.map((url, idx) => (
                                        <div key={idx} className="relative w-20 h-20 flex-shrink-0 border border-border bg-muted/20 overflow-hidden">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={url}
                                                alt={`Packaging image ${idx + 1}`}
                                                className="w-full h-full object-contain"
                                                loading="lazy"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = "";
                                                    (e.target as HTMLImageElement).classList.add("hidden");
                                                    const parent = (e.target as HTMLImageElement).parentElement;
                                                    if (parent) {
                                                        const fallback = document.createElement("div");
                                                        fallback.className = "flex items-center justify-center w-full h-full text-muted-foreground";
                                                        fallback.innerHTML = `<svg class="h-6 w-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
                                                        parent.appendChild(fallback);
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Draft title vs Suggestion comparison */}
                        {suggestion && (
                            <div className="space-y-1.5 border border-border p-2 bg-muted/10">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Title Comparison
                                </div>
                                {draftTitle && (
                                    <div className="flex items-start gap-2">
                                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap mt-0.5">
                                            Draft:
                                        </span>
                                        <span className="text-[10px] font-bold text-foreground break-words">
                                            {draftTitle}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-semibold text-primary whitespace-nowrap mt-0.5">
                                        Suggestion:
                                    </span>
                                    <span className="text-[10px] font-bold text-foreground break-words">
                                        {suggestion.title}
                                    </span>
                                </div>
                                {suggestion.confidence_score !== null && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] font-bold ${getConfidenceColor(suggestion.confidence_score)}`}>
                                            {formatConfidence(suggestion.confidence_score)} confidence
                                        </span>
                                        {suggestion.status === "applied" && (
                                            <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                                                <Check className="h-3 w-3" />
                                                Applied
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Conflicts */}
                        {extraction.conflicts && extraction.conflicts.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    Conflicts
                                </div>
                                <ul className="space-y-0.5">
                                    {extraction.conflicts.map((conflict, idx) => (
                                        <li key={idx} className="flex items-start gap-1.5 text-[10px] font-semibold text-red-700">
                                            <span className="mt-0.5">•</span>
                                            <span>{conflict}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Structured Facts Table */}
                        {extraction.structured_facts && Object.keys(extraction.structured_facts).length > 0 && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Extracted Facts
                                </span>
                                <div className="border border-border divide-y divide-border">
                                    {Object.entries(FACT_LABELS).map(([key, label]) => {
                                        const factValue = (extraction.structured_facts as Record<string, unknown>)[key];
                                        if (!factValue || (Array.isArray(factValue) && factValue.length === 0)) return null;
                                        const confidence = extraction.field_confidence?.[key];
                                        const value = Array.isArray(factValue) ? factValue.join(", ") : String(factValue);
                                        return (
                                            <div key={key} className="flex items-center justify-between px-2 py-1.5">
                                                <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
                                                <div className="flex items-center gap-2 text-right">
                                                    <span className="text-[10px] font-bold text-foreground max-w-48 truncate">{value}</span>
                                                    {confidence !== undefined && (
                                                        <span className={`text-[10px] font-bold ${getConfidenceColor(confidence)}`}>
                                                            {formatConfidence(confidence)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Raw Extraction Text (collapsible) */}
                        {extraction.raw_text && (
                            <div>
                                <button
                                    onClick={() => setRawTextOpen(!rawTextOpen)}
                                    className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <span>Raw Extraction Text</span>
                                    {rawTextOpen ? (
                                        <ChevronDown className="h-3 w-3" />
                                    ) : (
                                        <ChevronRight className="h-3 w-3" />
                                    )}
                                </button>
                                {rawTextOpen && (
                                    <pre className="mt-1 overflow-x-auto border border-border bg-muted/10 p-2 text-[9px] font-bold leading-tight max-h-32 overflow-y-auto">
                                        {extraction.raw_text}
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* Apply Action — only in suggestion mode */}
                        {suggestion && suggestion.status !== "applied" && suggestion.mode === "suggestion" && (
                            <button
                                onClick={handleApplyTitle}
                                disabled={applying}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-background bg-primary border border-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {applying ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Check className="h-3.5 w-3.5" />
                                )}
                                {applying ? "Applying…" : `Apply Packaging Title`}
                            </button>
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap gap-2 text-[9px] font-medium text-muted-foreground pt-1 border-t border-border">
                            {extraction.model && (
                                <span>Model: {extraction.model}</span>
                            )}
                            <span>Provider: {extraction.provider}</span>
                            <span>Prompt: {extraction.prompt_version}</span>
                            {extraction.completed_at && (
                                <span>{new Date(extraction.completed_at).toLocaleString()}</span>
                            )}
                            <span className="font-mono">ID: {extraction.id.slice(0, 8)}…</span>
                        </div>

                        {/* Extraction status info */}
                        {hasPendingExtraction && (
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-yellow-600 bg-yellow-50 px-2 py-1 border border-yellow-200">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                New extraction in progress
                            </div>
                        )}

                        {/* Reasons from title suggestion */}
                        {suggestion?.reasons && suggestion.reasons.length > 0 && (
                            <div className="space-y-0.5">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    Reasons
                                </div>
                                <ul className="space-y-0.5">
                                    {suggestion.reasons.map((reason, idx) => (
                                        <li key={idx} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                                            <span className="mt-0.5">•</span>
                                            <span>{reason}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
