import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminControlBarProps {
  children: ReactNode;
  className?: string;
}

export function AdminControlBar({ children, className }: AdminControlBarProps) {
  return (
    <section className={cn('admin-toolbar flex flex-col gap-4 p-4 md:p-5', className)}>
      {children}
    </section>
  );
}
