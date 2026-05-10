'use client';

import { useState } from 'react';
import { CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { analyzeIntegraAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileUpload } from '@/components/ui/file-upload';

export function SyncClient() {
 const [isAnalyzing, setIsAnalyzing] = useState(false);
 const [result, setResult] = useState<{
   syncRunId: string;
   summary: {
     totalInFile: number;
     matchedProducts: number;
     unchangedProducts: number;
     registerOnlyCount: number;
     websiteOnlyCount: number;
     priceMismatchCount: number;
     quantityMismatchCount: number;
     stockStatusMismatchCount: number;
     totalIssues: number;
   };
 } | null>(null);
 const [file, setFile] = useState<File | null>(null);

 const handleFileChange = (selectedFile: File | null) => {
 setFile(selectedFile);
 setResult(null);
 };

 const handleAnalyze = async () => {
 if (!file) return;

 setIsAnalyzing(true);
 const formData = new FormData();
 formData.append('file', file);

 const res = await analyzeIntegraAction(formData);
 setIsAnalyzing(false);

 if (res.success && res.summary && res.syncRunId) {
 setResult({ summary: res.summary, syncRunId: res.syncRunId });
 toast.success('File analyzed successfully');
 } else {
 toast.error(res.error || 'Failed to analyze file');
 }
 };

 return (
 <div className="space-y-6">
 <Card className="border border-border rounded-none">
 <CardHeader>
 <CardTitle>Integra Export Analysis</CardTitle>
 <CardDescription>
 Upload your Excel export from Integra to reconcile inventory with the website.
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
 <div className="text-xs text-muted-foreground font-normal mt-1">
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

 {result && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Total in File</CardDescription>
 <CardTitle className="text-3xl">{result.summary.totalInFile}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Total products found in the uploaded export.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Existing on Website</CardDescription>
 <CardTitle className="text-3xl text-green-700">{result.summary.matchedProducts}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Products already found in the live catalog.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Register-only Products</CardDescription>
 <CardTitle className="text-3xl text-orange-700">{result.summary.registerOnlyCount}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Products in the export not found on the website.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Price Mismatches</CardDescription>
 <CardTitle className="text-3xl text-amber-600">{result.summary.priceMismatchCount}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Products with different prices between systems.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Quantity Mismatches</CardDescription>
 <CardTitle className="text-3xl text-amber-600">{result.summary.quantityMismatchCount}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Products with different stock quantities.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none">
 <CardHeader className="pb-2">
 <CardDescription>Total Issues</CardDescription>
 <CardTitle className="text-3xl text-red-700">{result.summary.totalIssues}</CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">Total discrepancies found across all categories.</p>
 </CardContent>
 </Card>

 <Card className="border border-border rounded-none md:col-span-3">
 <CardHeader className="flex flex-row items-center justify-between">
 <div>
 <CardTitle>Reconciliation Complete</CardTitle>
 <CardDescription>
 Found {result.summary.totalIssues} issue{result.summary.totalIssues !== 1 ? 's' : ''} across {result.summary.totalInFile} products.
 </CardDescription>
 </div>
 <a
 href={`/admin/inventory/sync-runs/${result.syncRunId}`}
 className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
 >
 <ExternalLink className="h-4 w-4" />
 View Full Report →
 </a>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">
 {result.summary.matchedProducts} products matched, {result.summary.unchangedProducts} unchanged.
 {result.summary.registerOnlyCount > 0 && ` ${result.summary.registerOnlyCount} register-only product${result.summary.registerOnlyCount !== 1 ? 's' : ''} can be pushed to the product pipeline from the full report.`}
 </p>
 </CardContent>
 </Card>

 {result.summary.matchedProducts > 0 && result.summary.unchangedProducts === result.summary.matchedProducts && (
 <Card className="border border-border rounded-none md:col-span-3">
 <CardContent className="pt-6 flex flex-col items-center justify-center py-12">
 <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
 <h3 className="text-xl font-semibold text-green-900">All products are up to date!</h3>
 <p className="text-muted-foreground mt-2">No discrepancies found in this export.</p>
 </CardContent>
 </Card>
 )}
 </div>
 )}
 </div>
 );
}
