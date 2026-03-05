'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { submitReview } from '@/lib/storefront/reviews';
import { cn } from '@/lib/utils';

interface ReviewSubmissionFormProps {
  productId: string;
  productSlug: string;
  isLoggedIn: boolean;
  hasAlreadyReviewed: boolean;
}

export function ReviewSubmissionForm({
  productId,
  productSlug,
  isLoggedIn,
  hasAlreadyReviewed,
}: ReviewSubmissionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  // Form State
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  // Dynamic Lists
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [currentPro, setCurrentPro] = useState('');
  const [currentCon, setCurrentCon] = useState('');

  // Handle adding items to dynamic lists
  const addPro = () => {
    if (currentPro.trim()) {
      setPros([...pros, currentPro.trim()]);
      setCurrentPro('');
    }
  };

  const addCon = () => {
    if (currentCon.trim()) {
      setCons([...cons, currentCon.trim()]);
      setCurrentCon('');
    }
  };

  const removePro = (index: number) => {
    setPros(pros.filter((_, i) => i !== index));
  };

  const removeCon = (index: number) => {
    setCons(cons.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }

    startTransition(async () => {
      const result = await submitReview({
        productId,
        productSlug,
        rating: rating as 1 | 2 | 3 | 4 | 5,
        title,
        content,
        pros,
        cons,
      });

      if (result.success) {
        setIsSuccess(true);
        toast.success('Review submitted successfully');
      } else {
        toast.error(result.error || 'Failed to submit review');
      }
    });
  };

  if (!isLoggedIn) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6 text-center">
          <p className="text-zinc-700 mb-4">
            Please sign in to share your experience with this product.
          </p>
          <Button asChild variant="outline">
            <Link href={`/login?redirect=/products/${productSlug}`} className="hover:underline underline-offset-4">
              Sign In to Review
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (hasAlreadyReviewed) {
    return (
      <Card className="w-full bg-muted/50 border-dashed">
        <CardContent className="pt-6 text-center">
          <div className="flex justify-center mb-2">
            <Star className="h-8 w-8 text-accent fill-accent" />
          </div>
          <h3 className="font-semibold text-lg mb-1">Thanks for your feedback!</h3>
          <p className="text-zinc-700">
            You have already reviewed this product.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isSuccess) {
    return (
      <Card className="w-full border-primary/20 bg-primary/5">
        <CardContent className="pt-10 pb-10 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-4 text-primary">
            <Star className="h-6 w-6 fill-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-primary">Thank You!</h3>
          <p className="text-zinc-700 max-w-xs mx-auto">
            Your review is pending approval. We appreciate your feedback!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Write a Review</CardTitle>
        <CardDescription>
          Share your thoughts with other customers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Rating Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground">
            Rating <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="focus:outline-none transition-transform hover:scale-110 p-2 -m-2 rounded-full hover:bg-accent/5"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={cn(
                    "h-8 w-8 transition-colors",
                    (hoverRating || rating) >= star
                      ? "fill-accent text-accent"
                        : "text-zinc-700 fill-transparent"
                  )}
                />
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground h-4" aria-live="polite">
            {hoverRating ? (
              ['Terrible', 'Poor', 'Average', 'Good', 'Excellent'][hoverRating - 1]
            ) : rating ? (
              ['Terrible', 'Poor', 'Average', 'Good', 'Excellent'][rating - 1]
            ) : ''}
          </p>
        </div>

        {/* Title Input */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            Title (Optional)
          </label>
          <Input
            id="title"
            placeholder="Summarize your experience..."
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
            maxLength={100}
          />
        </div>

        {/* Content Textarea */}
        <div className="space-y-2">
          <label htmlFor="content" className="text-sm font-medium">
            Review (Optional)
          </label>
          <Textarea
            id="content"
            placeholder="What did you like or dislike?"
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 1000))}
            className="min-h-[120px]"
            maxLength={1000}
          />
          <div className="text-sm text-muted-foreground text-right">
            {content.length}/1000
          </div>
        </div>

        {/* Pros & Cons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pros */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-primary">Pros</label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a pro..."
                value={currentPro}
                onChange={(e) => setCurrentPro(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPro();
                  }
                }}
              />
              <Button 
                type="button" 
                size="icon" 
                variant="outline" 
                onClick={addPro}
                aria-label="Add pro"
                disabled={!currentPro.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {pros.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {pros.map((pro, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-1 bg-primary/10 text-primary text-sm px-2.5 py-1 rounded-full border border-primary/20"
                  >
                    <span>{pro}</span>
                    <button 
                      onClick={() => removePro(idx)}
                      className="ml-1 hover:text-primary/70 focus:outline-none"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cons */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-destructive">Cons</label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a con..."
                value={currentCon}
                onChange={(e) => setCurrentCon(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCon();
                  }
                }}
              />
              <Button 
                type="button" 
                size="icon" 
                variant="outline" 
                onClick={addCon}
                aria-label="Add con"
                disabled={!currentCon.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {cons.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {cons.map((con, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-1 bg-destructive/10 text-destructive text-sm px-2.5 py-1 rounded-full border border-destructive/20"
                  >
                    <span>{con}</span>
                    <button 
                      onClick={() => removeCon(idx)}
                      className="ml-1 hover:text-destructive/70 focus:outline-none"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4">
          <Button 
            className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90" 
            onClick={handleSubmit}
            disabled={isPending || rating === 0}
            size="lg"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Review'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
