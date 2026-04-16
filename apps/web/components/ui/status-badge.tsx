import React from 'react'
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
    Clock, 
    Package, 
    CheckCircle, 
    XCircle, 
    RefreshCcw,
    ShoppingBag
} from 'lucide-react'

export type OrderStatus = 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled' | 'refunded' | string

interface StatusBadgeProps {
    status: OrderStatus
    className?: string
    showIcon?: boolean
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
    const normalizedStatus = status.toLowerCase()

    const config: Record<string, { label: string, classes: string, icon: React.ElementType }> = {
        pending: {
            label: 'Pending',
            classes: 'bg-brand-gold/20 text-brand-burgundy border-brand-gold/50',
            icon: Clock
        },
        processing: {
            label: 'Processing',
            classes: 'bg-brand-forest-green/10 text-brand-forest-green border-brand-forest-green/30',
            icon: Package
        },
        ready: {
            label: 'Ready',
            classes: 'bg-brand-forest-green/20 text-brand-forest-green border-brand-forest-green/50',
            icon: ShoppingBag
        },
        completed: {
            label: 'Completed',
            classes: 'bg-brand-forest-green text-white border-zinc-950',
            icon: CheckCircle
        },
        cancelled: {
            label: 'Cancelled',
            classes: 'bg-brand-burgundy/10 text-brand-burgundy border-brand-burgundy/30',
            icon: XCircle
        },
        refunded: {
            label: 'Refunded',
            classes: 'bg-brand-burgundy/20 text-brand-burgundy border-brand-burgundy/50',
            icon: RefreshCcw
        }
    }

    const statusConfig = config[normalizedStatus] || {
        label: status,
        classes: 'bg-zinc-100 text-zinc-800 border-zinc-900',
        icon: Clock
    }

    const Icon = statusConfig.icon

    return (
        <Badge 
            variant="outline" 
            className={cn("gap-1.5 py-1", statusConfig.classes, className)}
        >
            {showIcon && <Icon className="h-3.5 w-3.5" />}
            <span className="capitalize">{statusConfig.label}</span>
        </Badge>
    )
}
