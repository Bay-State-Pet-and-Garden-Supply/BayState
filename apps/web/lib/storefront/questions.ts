'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface QuestionWithAnswers {
  id: string;
  question: string;
  user: { full_name: string | null } | null;
  created_at: string;
  answers: Array<{
    id: string;
    answer: string;
    is_seller_answer: boolean;
    user: { full_name: string | null } | null;
    created_at: string;
  }>;
}

export async function getProductQuestions(
  productId: string
): Promise<QuestionWithAnswers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_questions')
    .select(`
      id,
      question,
      created_at,
      user:profiles!product_questions_user_profile_fkey(full_name),
      answers:product_answers!product_answers_question_id_fkey(
        id,
        answer,
        is_official,
        created_at,
        user:profiles!product_answers_user_profile_fkey(full_name)
      )
    `)
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching questions:', error);
    if (error && typeof error === 'object' && 'message' in error) {
      const pgError = error as { message: string; details: string; hint: string };
      console.error('Error details:', pgError.message, pgError.details, pgError.hint);
    }
    return [];
  }

  return (data || []).map((q) => {
    const questionUser = Array.isArray(q.user) ? q.user[0] : q.user;
    return {
      id: q.id,
      question: q.question,
      user: questionUser as { full_name: string | null } | null,
      created_at: q.created_at,
      answers: (q.answers || []).map((a) => {
        const answerUser = Array.isArray(a.user) ? a.user[0] : a.user;
        return {
          id: a.id,
          answer: a.answer,
          is_seller_answer: a.is_official,
          user: answerUser as { full_name: string | null } | null,
          created_at: a.created_at,
        };
      }),
    };
  });
}

export async function submitQuestion(
  productId: string,
  question: string,
  productSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Please sign in to ask a question' };
  }

  if (!question.trim() || question.length < 10) {
    return { success: false, error: 'Question must be at least 10 characters' };
  }

  const { error } = await supabase
    .from('product_questions')
    .insert({
      product_id: productId,
      user_id: user.id,
      question: question.trim(),
      status: 'pending',
    });

  if (error) {
    console.error('Error submitting question:', error);
    return { success: false, error: 'Failed to submit question' };
  }

  revalidatePath(`/products/${productSlug}`);
  return { success: true };
}
