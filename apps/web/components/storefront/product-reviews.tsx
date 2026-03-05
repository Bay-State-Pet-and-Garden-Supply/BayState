'use client';

import React from 'react';
import { Star, ThumbsUp, CheckCircle2, XCircle, Check } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ReviewWithUser } from '@/lib/storefront/reviews';

interface ProductReviewsProps {
  reviews: ReviewWithUser[];
  stats: {
    avgRating: number;
    totalReviews: number;
    distribution: { rating: number; count: number }[];
  };
}

export function ProductReviews({ reviews, stats }: ProductReviewsProps) {
  if (!reviews || reviews.length === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="bg-background p-4 rounded-full mb-4 shadow-sm">
            <Star className="h-8 w-8 text-zinc-700" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No reviews yet</h3>
          <p className="text-zinc-700 max-w-sm mt-1">
            Be the first to share your experience with this product. Your feedback helps others make better choices.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
      {/* Rating Summary - Sticky on Desktop */}
      <div className="lg:col-span-4 space-y-6">
        <div className="lg:sticky lg:top-24 space-y-6">
          <Card className="border-none shadow-none bg-transparent lg:bg-card lg:border lg:shadow-sm">
            <CardHeader className="pb-2 lg:pb-6">
              <h3 className="font-semibold text-xl lg:text-2xl tracking-tight">Customer Reviews</h3>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Average Rating Hero */}
              <div className="flex items-baseline gap-4">
                <span className="text-5xl font-bold tracking-tighter text-foreground">
                  {stats.avgRating.toFixed(1)}
                </span>
                <div className="flex flex-col">
                  <StarRating rating={stats.avgRating} size="md" />
                  <span className="text-sm text-zinc-700 mt-1 font-medium">
                    Based on {stats.totalReviews} reviews
                  </span>
                </div>
              </div>

              {/* Distribution Bars */}
              <div className="space-y-3">
                {stats.distribution.map((item) => (
                  <div key={item.rating} className="flex items-center gap-3 text-sm group">
                    <div className="flex items-center gap-1 w-12 shrink-0 font-medium text-zinc-700 group-hover:text-foreground transition-colors">
                      <span>{item.rating}</span>
                      <Star className="h-3 w-3 fill-current text-zinc-700" />
                    </div>
                    <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#FCD048] rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${stats.totalReviews > 0 ? (item.count / stats.totalReviews) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-zinc-700 tabular-nums text-xs">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reviews List */}
      <div className="lg:col-span-8 space-y-6">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}

// Subcomponents

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const stars = [1, 2, 3, 4, 5];
  const iconSize = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {stars.map((star) => {
        const isFull = star <= Math.round(rating);
        return (
          <Star
            key={star}
            className={cn(
              iconSize,
              "transition-colors",
              isFull ? "fill-[#FCD048] text-[#FCD048]" : "fill-muted/20 text-zinc-700"
            )}
          />
        );
      })}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewWithUser }) {
  const initials = review.user?.full_name
    ? review.user.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AN';

  return (
    <Card className="border-0 shadow-sm bg-card/50 hover:bg-card transition-colors duration-200">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Avatar / User Info Mobile */}
          <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 min-w-[120px]">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold tracking-wider text-secondary-foreground">
              {initials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate max-w-[150px]">
                {review.user?.full_name || 'Anonymous'}
              </span>
              <span className="text-xs text-zinc-700">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(review.created_at))}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StarRating rating={review.rating} />
              {review.is_verified_purchase && (
                <Badge 
                  variant="secondary" 
                  className="bg-[#348C41]/10 text-[#348C41] hover:bg-[#348C41]/20 border-0 gap-1 pl-1 pr-2 h-6"
                >
                  <Check className="h-3 w-3" />
                  Verified Purchase
                </Badge>
              )}
            </div>

            {review.title && (
              <h4 className="font-bold text-base leading-tight">{review.title}</h4>
            )}

            <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
              {review.content}
            </div>

            {/* Pros & Cons */}
            {(review.pros?.length || 0) > 0 || (review.cons?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {(review.pros?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-500 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Pros
                    </span>
                    <ul className="space-y-1">
                      {review.pros!.map((pro, i) => (
                        <li key={i} className="text-xs text-zinc-700 flex items-start gap-2">
                          <span className="block mt-1.5 h-1 w-1 rounded-full bg-green-500/50 shrink-0" />
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(review.cons?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-500 flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> Cons
                    </span>
                    <ul className="space-y-1">
                      {review.cons!.map((con, i) => (
                        <li key={i} className="text-xs text-zinc-700 flex items-start gap-2">
                          <span className="block mt-1.5 h-1 w-1 rounded-full bg-red-500/50 shrink-0" />
                          {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            {/* Helpful Count */}
            {review.helpful_count > 0 && (
              <div className="pt-2 flex items-center gap-2 text-xs text-zinc-700">
                <ThumbsUp className="h-3.5 w-3.5" />
                <span>{review.helpful_count} found this helpful</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
