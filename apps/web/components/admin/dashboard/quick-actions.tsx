import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  variant?: 'default' | 'outline' | 'secondary';
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action.href}
            variant={action.variant || 'outline'}
            asChild
          >
            <Link href={action.href} className="flex items-center gap-2 hover:underline underline-offset-4">
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
