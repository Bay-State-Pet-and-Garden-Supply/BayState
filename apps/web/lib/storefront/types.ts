import { ProductReview } from '@/lib/types';

export interface RecentlyViewedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  viewed_at: string;
}

export interface RelatedProductWithDetails {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  relation_type: string;
}

export interface QuestionWithAnswers {
  id: string;
  question: string;
  created_at: string;
  user: { full_name: string | null } | null;
  answers: Array<{
    id: string;
    answer: string;
    created_at: string;
    user: { full_name: string | null } | null;
    is_seller_answer: boolean;
  }>;
}

export type ReviewWithUser = Omit<ProductReview, 'user'> & {
  user?: { full_name: string | null };
};

export interface SubmitReviewInput {
  productId: string;
  productSlug: string;
  rating: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
}
