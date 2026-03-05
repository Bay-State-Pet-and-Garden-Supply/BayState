'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Star, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MoreHorizontal, 
  Eye, 
  ThumbsUp, 
  ThumbsDown, 
  Trash2,
  Check,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { DataTable, type Column } from '@/components/admin/data-table';
import type { ReviewWithProduct } from '@/lib/admin/reviews';
import { updateReviewStatus, deleteReview } from '@/lib/admin/reviews';

interface AdminReviewsClientProps {
  initialReviews: ReviewWithProduct[];
  totalCount: number;
  stats: { pending: number; approved: number; rejected: number; total: number };
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export function AdminReviewsClient({ initialReviews, totalCount, stats }: AdminReviewsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedReview, setSelectedReview] = useState<ReviewWithProduct | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Filter reviews based on active tab
  const filteredReviews = initialReviews.filter((review) => {
    if (activeTab === 'all') return true;
    return review.status === activeTab;
  });

  const handleStatusUpdate = async (reviewId: string, newStatus: 'approved' | 'rejected') => {
    setIsProcessing(reviewId);
    try {
      const res = await updateReviewStatus(reviewId, newStatus);
      if (!res.success) throw new Error(res.error);
      
      toast.success(`Review marked as ${newStatus}`);
      router.refresh();
      
      // If updating the currently selected review, close the dialog
      if (selectedReview?.id === reviewId) {
        setSelectedReview(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    setIsProcessing(reviewId);
    try {
      const res = await deleteReview(reviewId);
      if (!res.success) throw new Error(res.error);
      
      toast.success('Review deleted');
      router.refresh();
      
      if (selectedReview?.id === reviewId) {
        setSelectedReview(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete review');
    } finally {
      setIsProcessing(null);
      setReviewToDelete(null);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const columns: Column<ReviewWithProduct>[] = [
    {
      key: 'product.name',
      header: 'Product',
      sortable: true,
      searchable: true,
      render: (_, row) => (
        <div className="max-w-[200px]">
          <p className="font-medium truncate" title={row.product?.name || 'Unknown Product'}>
            {row.product?.name || 'Unknown Product'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {row.user?.full_name || 'Anonymous'}
          </p>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      render: (value) => renderStars(Number(value)),
    },
    {
      key: 'title',
      header: 'Title',
      searchable: true,
      render: (value, row) => (
        <div className="max-w-[250px]">
          <p className="font-medium truncate" title={String(value)}>{String(value)}</p>
          <p className="text-xs text-muted-foreground truncate" title={row.content ?? undefined}>
            {row.content}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value) => {
        const config = statusConfig[value as keyof typeof statusConfig];
        if (!config) return <Badge variant="outline">{String(value)}</Badge>;
        
        let badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" = "outline";
        
        if (value === 'approved') badgeVariant = "success";
        else if (value === 'rejected') badgeVariant = "destructive";
        else if (value === 'pending') badgeVariant = "warning";
        
        return (
          <Badge variant={badgeVariant} className="gap-1">
            <config.icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      render: (value) => <span className="text-sm text-muted-foreground">{formatDate(String(value))}</span>,
    },
  ];

  const renderActions = (review: ReviewWithProduct) => (
    <div className="flex items-center gap-1">
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => setSelectedReview(review)}
        aria-label="View review details"
      >
        <Eye className="h-4 w-4" />
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open actions menu">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {review.status !== 'approved' && (
            <DropdownMenuItem onClick={() => handleStatusUpdate(review.id, 'approved')}>
              <Check className="mr-2 h-4 w-4 text-green-600" />
              Approve
            </DropdownMenuItem>
          )}
          {review.status !== 'rejected' && (
            <DropdownMenuItem onClick={() => handleStatusUpdate(review.id, 'rejected')}>
              <X className="mr-2 h-4 w-4 text-red-600" />
              Reject
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setReviewToDelete(review.id)} 
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All time reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting moderation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Visible on site</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Hidden from site</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="border-none shadow-none">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between pb-4">
            <TabsList>
              <TabsTrigger value="all">All Reviews</TabsTrigger>
              <TabsTrigger value="pending" className="gap-2">
                Pending
                {stats.pending > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{stats.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-0">
            <DataTable 
              data={filteredReviews} 
              columns={columns} 
              searchPlaceholder="Search reviews..." 
              actions={renderActions}
            />
          </TabsContent>
          <TabsContent value="pending" className="mt-0">
            <DataTable 
              data={filteredReviews} 
              columns={columns} 
              searchPlaceholder="Search pending reviews..." 
              actions={renderActions}
            />
          </TabsContent>
          <TabsContent value="approved" className="mt-0">
            <DataTable 
              data={filteredReviews} 
              columns={columns} 
              searchPlaceholder="Search approved reviews..." 
              actions={renderActions}
            />
          </TabsContent>
          <TabsContent value="rejected" className="mt-0">
            <DataTable 
              data={filteredReviews} 
              columns={columns} 
              searchPlaceholder="Search rejected reviews..." 
              actions={renderActions}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Review Details Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
            <DialogDescription>
              Review for <span className="font-medium text-foreground">{selectedReview?.product?.name}</span>
            </DialogDescription>
          </DialogHeader>
          
          {selectedReview && (
            <div className="grid gap-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Rating</span>
                    {renderStars(selectedReview.rating)}
                  </div>
                  <div className="ml-6 flex flex-col">
                    <span className="text-sm font-medium">Date</span>
                    <span className="text-sm text-muted-foreground">{formatDate(selectedReview.created_at)}</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-end">
                   <span className="text-sm font-medium mb-1">Status</span>
                   {(() => {
                      const config = statusConfig[selectedReview.status as keyof typeof statusConfig];
                      return (
                        <Badge variant="outline" className={`${config?.color} border-0`}>
                          {config?.icon && <config.icon className="mr-1 h-3 w-3" />}
                          {config?.label || selectedReview.status}
                        </Badge>
                      );
                   })()}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium leading-none">Review Title</h4>
                <p className="text-lg font-semibold">{selectedReview.title}</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium leading-none">Content</h4>
                <div className="rounded-md bg-muted p-4 text-sm leading-relaxed">
                  {selectedReview.content}
                </div>
              </div>

              {/* Pros & Cons if available (Assuming they might exist in the future or in flexible json, 
                  but standard ProductReview type usually has them if extended. 
                  Checking type definition in lib/types would be ideal, but for now assuming standard fields 
                  or ignoring if not present. 
                  If they are not in ReviewWithProduct, I will omit or check strictly.)
                  
                  Based on inference, standard reviews often have text content. 
                  I'll stick to what I know exists: content, title, rating.
              */}

              <div className="flex items-center justify-between border-t pt-4">
                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Review ID:</span>
                    <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">
                      {selectedReview.id.split('-')[0]}...
                    </code>
                 </div>
                 <div className="flex gap-2">
                    {selectedReview.status === 'pending' && (
                      <>
                        <Button 
                          variant="outline" 
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                          onClick={() => handleStatusUpdate(selectedReview.id, 'rejected')}
                          disabled={!!isProcessing}
                        >
                          Reject
                        </Button>
                        <Button 
                          className="bg-[#348C41] hover:bg-[#2a7034]"
                          onClick={() => handleStatusUpdate(selectedReview.id, 'approved')}
                          disabled={!!isProcessing}
                        >
                          Approve
                        </Button>
                      </>
                    )}
                    {selectedReview.status === 'approved' && (
                       <Button 
                          variant="destructive"
                          onClick={() => handleStatusUpdate(selectedReview.id, 'rejected')}
                          disabled={!!isProcessing}
                        >
                          Reject Review
                        </Button>
                    )}
                    {selectedReview.status === 'rejected' && (
                       <Button 
                          variant="default"
                          className="bg-[#348C41] hover:bg-[#2a7034]"
                          onClick={() => handleStatusUpdate(selectedReview.id, 'approved')}
                          disabled={!!isProcessing}
                        >
                          Approve Review
                        </Button>
                    )}
                 </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reviewToDelete} onOpenChange={(open) => !open && setReviewToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this review? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reviewToDelete && handleDelete(reviewToDelete)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
