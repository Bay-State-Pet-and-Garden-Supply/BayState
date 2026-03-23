'use client';

import { useState } from 'react';
import { Database, Loader2, X, CheckCircle, Upload, FileText, AlertCircle, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileUpload } from '@/components/ui/file-upload';
import { formatCurrency } from '@/lib/utils';
import { analyzeIntegraAction, processOnboardingAction } from '@/app/admin/tools/integra-sync/actions';
import { SyncAnalysis } from '@/lib/admin/integra-sync';

interface IntegraImportDialogProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function IntegraImportDialog({
    onSuccess,
    onCancel,
}: IntegraImportDialogProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [analysis, setAnalysis] = useState<SyncAnalysis | null>(null);
    const [file, setFile] = useState<File | null>(null);

    const handleFileChange = (selectedFile: File | null) => {
        setFile(selectedFile);
        setAnalysis(null);
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await analyzeIntegraAction(formData);
            if (result.success && result.analysis) {
                setAnalysis(result.analysis);
                toast.success('File analyzed successfully');
            } else {
                toast.error(result.error || 'Failed to analyze file');
            }
        } catch (error) {
            toast.error('An error occurred during analysis');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAddToOnboarding = async () => {
        if (!analysis || analysis.newProducts.length === 0) return;

        setIsProcessing(true);
        try {
            const result = await processOnboardingAction(analysis.newProducts);
            if (result.success) {
                toast.success(`Successfully added ${result.count} products to onboarding pipeline`);
                onSuccess();
            } else {
                toast.error(result.error || 'Failed to add products');
            }
        } catch (error) {
            toast.error('An error occurred during processing');
        } finally {
            setIsProcessing(false);
        }
    };

    const isBusy = isAnalyzing || isProcessing;
    const hasNewProducts = analysis && analysis.newProducts.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-card shadow-2xl flex flex-col border border-zinc-200">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-8 py-5 flex-shrink-0 bg-zinc-50/50">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900">Integra Register Sync</h2>
                            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Onboarding Pipeline</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isBusy}
                        className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
                    {!analysis ? (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            <div className="max-w-2xl">
                                <h3 className="text-lg font-semibold text-zinc-900 mb-2">Upload Inventory Export</h3>
                                <p className="text-zinc-600 leading-relaxed">
                                    Upload your Excel export from the Integra system. We&apos;ll cross-reference it with the website catalog to find missing items.
                                </p>
                                <div className="mt-4 flex items-center gap-4 text-xs font-medium text-zinc-400">
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 rounded border border-zinc-100">
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>.xlsx or .xls</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 rounded border border-zinc-100">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        <span>Required: SKU_NO, LIST_PRICE</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <FileUpload
                                    onFileSelect={handleFileChange}
                                    accept=".xlsx, .xls"
                                    maxSize={20}
                                    loading={isAnalyzing}
                                    selectedFile={file}
                                    label={
                                        <div className="py-4">
                                            <p className="text-sm font-medium text-zinc-900">
                                                <span className="text-orange-600 font-bold underline decoration-orange-200 underline-offset-4 hover:decoration-orange-500 transition-colors">Click to upload</span> or drag and drop
                                            </p>
                                            <p className="text-xs text-zinc-400 mt-2">Excel spreadsheet up to 20MB</p>
                                        </div>
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-card p-6 shadow-sm">
                                    <div className="absolute top-0 right-0 h-24 w-24 -mr-8 -mt-8 rounded-full bg-zinc-50 opacity-50" />
                                    <p className="text-sm font-semibold text-zinc-400 mb-1">Total in File</p>
                                    <h4 className="text-4xl font-black text-zinc-900">{analysis.totalInFile}</h4>
                                    <p className="text-xs text-zinc-500 mt-2">Unique SKUs analyzed</p>
                                </div>

                                <div className="relative overflow-hidden rounded-2xl border border-green-100 bg-green-50/20 p-6 shadow-sm">
                                    <div className="absolute top-0 right-0 h-24 w-24 -mr-8 -mt-8 rounded-full bg-green-100 opacity-30" />
                                    <p className="text-sm font-semibold text-green-600/60 mb-1">Live on Store</p>
                                    <h4 className="text-4xl font-black text-green-700">{analysis.existingOnWebsite}</h4>
                                    <p className="text-xs text-green-600/70 mt-2">Already in catalog</p>
                                </div>

                                <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/30 p-6 shadow-md shadow-orange-100/50 ring-1 ring-orange-200/50">
                                    <div className="absolute top-0 right-0 h-24 w-24 -mr-8 -mt-8 rounded-full bg-orange-100 opacity-40" />
                                    <p className="text-sm font-semibold text-orange-600/70 mb-1">New Products</p>
                                    <h4 className="text-4xl font-black text-orange-700">{analysis.newProducts.length}</h4>
                                    <p className="text-xs text-orange-600/70 mt-2">Ready to onboard</p>
                                </div>
                            </div>

                            {analysis.newProducts.length > 0 ? (
                                <div className="space-y-6">
                                    <div className="bg-zinc-900 rounded-2xl p-6 text-white shadow-xl">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                            <h3 className="text-lg font-bold">Import Selection</h3>
                                        </div>
                                        <p className="text-sm text-zinc-400">
                                            Found <span className="text-orange-400 font-bold">{analysis.newProducts.length}</span> items not in the live store. Review the list below before finalizing the import.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-card shadow-sm">
                                        <div className="max-h-72 overflow-auto scrollbar-thin scrollbar-thumb-zinc-200">
                                            <table className="w-full text-sm text-left border-collapse">
                                                <thead className="bg-zinc-50/80 sticky top-0 backdrop-blur-md border-b border-zinc-200 z-10">
                                                    <tr>
                                                        <th className="px-6 py-4 font-bold text-zinc-500 text-[11px] uppercase tracking-widest">SKU</th>
                                                        <th className="px-6 py-4 font-bold text-zinc-500 text-[11px] uppercase tracking-widest">Product Name</th>
                                                        <th className="px-6 py-4 text-right font-bold text-zinc-500 text-[11px] uppercase tracking-widest">List Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100">
                                                    {analysis.newProducts.slice(0, 50).map((product) => (
                                                        <tr key={product.sku} className="group hover:bg-zinc-50/50 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <span className="font-mono text-zinc-900 bg-zinc-100 px-2 py-1 rounded text-xs border border-zinc-200/50">{product.sku}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-zinc-700 font-medium group-hover:text-zinc-900">{product.name}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right font-bold text-zinc-900">
                                                                {formatCurrency(product.price)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {analysis.newProducts.length > 50 && (
                                                        <tr>
                                                            <td colSpan={3} className="px-6 py-8 text-center text-zinc-400 text-xs italic bg-zinc-50/30">
                                                                Showing first 50 of {analysis.newProducts.length} products found in the export.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-center pt-2">
                                        <button 
                                            onClick={() => {
                                                setAnalysis(null);
                                                setFile(null);
                                            }}
                                            className="text-xs font-bold text-zinc-400 hover:text-orange-600 transition-colors py-2 px-4 rounded-full hover:bg-orange-50"
                                        >
                                            Upload Different File
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-center bg-green-50/10 rounded-3xl border border-dashed border-green-200">
                                    <div className="h-20 w-20 rounded-full bg-green-50 flex items-center justify-center mb-6">
                                        <CheckCircle className="w-10 h-10 text-green-500" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-zinc-900">Database is Synchronized</h3>
                                    <p className="text-zinc-500 mt-2 max-w-sm mx-auto leading-relaxed">
                                        Excellent! Every product found in this export is already present in your website catalog.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 px-8 py-5 flex-shrink-0 rounded-b-2xl">
                    <p className="text-xs text-zinc-400 font-medium">
                        Supported formats: CSV, XLSX, XLS
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            disabled={isBusy}
                            className="text-zinc-500 font-bold hover:bg-zinc-200/50"
                        >
                            Cancel
                        </Button>

                        {!analysis ? (
                            <Button
                                onClick={handleAnalyze}
                                disabled={!file || isBusy}
                                size="lg"
                                className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200 transition-all active:scale-[0.98] px-8 font-bold h-11"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Analyzing...</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight className="mr-2 h-4 w-4" />
                                        <span>Process Inventory File</span>
                                    </>
                                )}
                            </Button>
                        ) : hasNewProducts ? (
                            <Button
                                onClick={handleAddToOnboarding}
                                disabled={isProcessing}
                                size="lg"
                                className="bg-[#008850] hover:bg-[#008850]/90 text-white shadow-lg shadow-green-100 transition-all active:scale-[0.98] px-8 font-bold h-11"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Importing…</span>
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-4 w-4" />
                                        <span>Add to Pipeline</span>
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={onCancel}
                                size="lg"
                                className="bg-zinc-900 text-white hover:bg-zinc-800 font-bold px-8 h-11"
                            >
                                Done
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
