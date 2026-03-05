'use client';

import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { analyzeIntegraAction, processOnboardingAction } from './actions';
import { SyncAnalysis } from '@/lib/admin/integra-sync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileUpload } from '@/components/ui/file-upload';
import { formatCurrency } from '@/lib/utils';

export function SyncClient() {
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

        const result = await analyzeIntegraAction(formData);
        setIsAnalyzing(false);

        if (result.success && result.analysis) {
            setAnalysis(result.analysis);
            toast.success('File analyzed successfully');
        } else {
            toast.error(result.error || 'Failed to analyze file');
        }
    };

    const handleAddToOnboarding = async () => {
        if (!analysis || analysis.newProducts.length === 0) return;

        setIsProcessing(true);
        const result = await processOnboardingAction(analysis.newProducts);
        setIsProcessing(false);

        if (result.success) {
            toast.success(`Successfully added ${result.count} products to onboarding pipeline`);
            setAnalysis(null);
            setFile(null);
        } else {
            toast.error(result.error || 'Failed to add products');
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Integra Export Analysis</CardTitle>
                    <CardDescription>
                        Upload your Excel export from Integra to identify products missing from the website.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <FileUpload
                                    onFileSelect={handleFileChange}
                                    accept=".xlsx, .xls"
                                    maxSize={20}
                                    loading={isAnalyzing}
                                    selectedFile={file}
                                    label={
                                        <>
                                            <span className="font-semibold text-purple-600">Click to upload</span> or drag and drop
                                            <div className="text-xs text-gray-500 font-normal mt-1">
                                                Excel files (.xlsx, .xls)
                                            </div>
                                        </>
                                    }
                                />
                            </div>
                            <Button
                                onClick={handleAnalyze}
                                disabled={!file || isAnalyzing}
                                className="h-32 px-8"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    'Analyze File'
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {analysis && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="border-blue-100 bg-blue-50/30">
                        <CardHeader className="pb-2">
                            <CardDescription>Total in File</CardDescription>
                            <CardTitle className="text-3xl">{analysis.totalInFile}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600">Total products found in the uploaded export.</p>
                        </CardContent>
                    </Card>

                    <Card className="border-green-100 bg-green-50/30">
                        <CardHeader className="pb-2">
                            <CardDescription>Existing on Website</CardDescription>
                            <CardTitle className="text-3xl text-green-700">{analysis.existingOnWebsite}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600">Products already found in the live catalog.</p>
                        </CardContent>
                    </Card>

                    <Card className="border-orange-100 bg-orange-50/30">
                        <CardHeader className="pb-2">
                            <CardDescription>New Products</CardDescription>
                            <CardTitle className="text-3xl text-orange-700">{analysis.newProducts.length}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600">Products missing from the website.</p>
                        </CardContent>
                    </Card>

                    {analysis.newProducts.length > 0 && (
                        <Card className="md:col-span-3 border-orange-200">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Ready for Onboarding</CardTitle>
                                    <CardDescription>
                                        These {analysis.newProducts.length} products can be added to the intake pipeline.
                                    </CardDescription>
                                </div>
                                <Button
                                    onClick={handleAddToOnboarding}
                                    disabled={isProcessing}
                                    size="lg"
                                    className="bg-orange-600 hover:bg-orange-700"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        'Add all to Onboarding Pipeline'
                                    )}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2 text-left font-medium text-gray-600">SKU</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                                                <th className="px-4 py-2 text-right font-medium text-gray-600">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {analysis.newProducts.slice(0, 100).map((product) => (
                                                <tr key={product.sku}>
                                                    <td className="px-4 py-2 font-mono">{product.sku}</td>
                                                    <td className="px-4 py-2">{product.name}</td>
                                                    <td className="px-4 py-2 text-right">{formatCurrency(product.price)}</td>
                                                </tr>
                                            ))}
                                            {analysis.newProducts.length > 100 && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-4 text-center text-gray-600 italic">
                                                        Showing first 100 of {analysis.newProducts.length} new products...
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {analysis.newProducts.length === 0 && (
                        <Card className="md:col-span-3 border-green-200 bg-green-50/20">
                            <CardContent className="pt-6 flex flex-col items-center justify-center py-12">
                                <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                                <h3 className="text-xl font-semibold text-green-900">All products are up to date!</h3>
                                <p className="text-gray-600 mt-2">No new products were found in the export that aren't already on the website.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
