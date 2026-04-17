import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface ConsolidatedProduct {
  id: string;
  name: string;
  brand: string;
  weight: string;
  images: string[];
}

interface ConsolidationStatus {
  batchId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalProducts: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  errors?: string[];
  results?: ConsolidatedProduct[];
}

interface ConsolidationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string | null;
  status: ConsolidationStatus | null;
}

export function ConsolidationDetailsModal({
  isOpen,
  onClose,
  batchId,
  status,
}: ConsolidationDetailsModalProps) {
  if (!status) return null;

  const getStatusBadge = (statusStr: string) => {
    switch (statusStr) {
      case 'completed':
        return <Badge className="bg-primary hover:bg-primary/80"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'in_progress':
        return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" /> In Progress</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-secondary">
              Batch Details
            </DialogTitle>
            {getStatusBadge(status.status)}
          </div>
          <DialogDescription>
            Batch ID: {batchId || status.batchId}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1 overflow-hidden">
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{status.totalProducts}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Processed</span>
              <span className="text-2xl font-bold">{status.processedCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground text-primary">Success</span>
              <span className="text-2xl font-bold text-primary">{status.successCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground text-destructive">Errors</span>
              <span className="text-2xl font-bold text-destructive">{status.errorCount}</span>
            </div>
          </div>

          {/* Errors */}
          {status.errors && status.errors.length > 0 && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <AlertCircle className="w-4 h-4" />
                Errors ({status.errors.length})
              </div>
              <ScrollArea className="h-24">
                <ul className="list-disc list-inside text-sm space-y-1">
                  {status.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Results */}
          {status.results && status.results.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <h3 className="font-semibold mb-2 text-secondary">Processed Products</h3>
              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-4 space-y-4">
                  {status.results.map((product) => (
                    <div key={product.id} className="flex items-start justify-between p-3 bg-card border rounded-lg shadow-sm">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Badge variant="outline" className="text-xs">{product.brand}</Badge>
                          <span>{product.weight}</span>
                        </div>
                      </div>
                      {product.images && product.images.length > 0 && (
                        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {product.images.length} image(s)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
