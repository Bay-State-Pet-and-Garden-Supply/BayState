'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MessageCircle, HelpCircle, Store, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { submitQuestion, type QuestionWithAnswers } from '@/lib/storefront/questions';
import { cn } from '@/lib/utils';

interface ProductQAProps {
  productId: string;
  productSlug: string;
  questions: QuestionWithAnswers[];
  isLoggedIn: boolean;
}

export function ProductQA({ productId, productSlug, questions, isLoggedIn }: ProductQAProps) {
  const [questionText, setQuestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questionText.length < 10) {
      toast.error('Question must be at least 10 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitQuestion(productId, questionText, productSlug);
      
      if (result.success) {
        toast.success('Your question has been submitted and is pending approval.');
        setQuestionText('');
      } else {
        toast.error(result.error || 'Failed to submit question. Please try again.');
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-8" id="questions">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <MessageCircle className="h-5 w-5 text-zinc-700" />
        <h2 className="text-2xl font-semibold tracking-tight">Questions & Answers</h2>
        <Badge variant="secondary" className="ml-auto">
          {questions.length} {questions.length === 1 ? 'Question' : 'Questions'}
        </Badge>
      </div>

      <div className="space-y-4">
        {questions.length === 0 ? (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <HelpCircle className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-lg font-medium text-foreground">No questions yet</p>
              <p className="text-sm text-zinc-700 mt-1">
                Be the first to ask about this product!
              </p>
            </CardContent>
          </Card>
        ) : (
          questions.map((question) => (
            <QuestionItem key={question.id} question={question} />
          ))
        )}
      </div>

      <Card className="overflow-hidden border-none shadow-md ring-1 ring-black/5 dark:ring-white/10">
        <div className="h-2 w-full bg-[#348C41]" /> {/* Forest Green Accent */}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#348C41]" />
            Ask a Question
          </CardTitle>
          <CardDescription>
            Have a question about this product? Ask the seller directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoggedIn ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Textarea
                placeholder="Type your question here..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="min-h-[100px] resize-none focus-visible:ring-[#348C41]"
                maxLength={500}
              />
              <div className="flex items-center justify-between text-xs text-zinc-700">
                <span>Min 10 characters</span>
                <span>{questionText.length}/500</span>
              </div>
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isSubmitting || questionText.length < 10}
                  className="bg-[#348C41] hover:bg-[#2a7034] text-white"
                >
                  {isSubmitting ? (
                    <>Processing...</>
                  ) : (
                    <>
                      Submit Question <Send className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6 text-center space-y-4">
              <p className="text-zinc-700">
                You must be signed in to post a question.
              </p>
              <Button asChild variant="outline" className="border-[#2a7034] text-[#2a7034] hover:bg-[#2a7034]/10">
                <Link href={`/login?redirect=/products/${productSlug}`}>
                  Sign in to Ask
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionItem({ question }: { question: QuestionWithAnswers }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-sm">
      <div className="p-4 md:p-6 space-y-4">
        {/* Question Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="font-medium text-foreground">
                {question.user?.full_name || 'Anonymous'}
              </span>
              <span>•</span>
              <time dateTime={question.created_at}>
                {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(question.created_at))}
              </time>
            </div>
            <h3 className="font-semibold text-base md:text-lg leading-tight">
              Q: {question.question}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 w-8 p-0 text-zinc-700"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {/* Answers Section */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent className="space-y-4 pt-4 animate-in slide-in-from-top-2 fade-in duration-200">
            {question.answers && question.answers.length > 0 ? (
              <div className="pl-4 md:pl-6 border-l-2 border-muted space-y-6">
                {question.answers.map((answer) => (
                  <div key={answer.id} className="space-y-2 relative">
                    <div className="flex items-center gap-2 mb-1">
                      {answer.is_seller_answer ? (
                        <Badge className="bg-[#348C41] hover:bg-[#2a7034] text-white flex items-center gap-1 px-2 py-0.5 h-6">
                          <Store className="h-3 w-3" /> Seller
                        </Badge>
                      ) : (
                        <span className="text-sm font-medium">
                          {answer.user?.full_name || 'Community Member'}
                        </span>
                      )}
                      <span className="text-xs text-zinc-700">
                         • {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(answer.created_at))}
                      </span>
                    </div>
                    
                    <div className="text-sm md:text-base text-foreground/90 leading-relaxed">
                      A: {answer.answer}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-700 italic pl-4 border-l-2 border-muted">
                No answers yet.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}
