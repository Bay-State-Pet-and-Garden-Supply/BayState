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
            classes: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80 border-transparent',
            icon: Clock
        },
        processing: {
            label: 'Processing',
            classes: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent',
            icon: Package
        },
        ready: {
            label: 'Ready',
            classes: 'bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent',
            icon: ShoppingBag
        },
        completed: {
            label: 'Completed',
            classes: 'bg-gray-100 text-gray-800 hover:bg-gray-100/80 border-transparent',
            icon: CheckCircle
        },
        cancelled: {
            label: 'Cancelled',
            classes: 'bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent',
            icon: XCircle
        },
        refunded: {
            label: 'Refunded',
            classes: 'bg-purple-100 text-purple-800 hover:bg-purple-100/80 border-transparent',
            icon: RefreshCcw
        }
    }

    const statusConfig = config[normalizedStatus] || {
        label: status,
        classes: 'bg-gray-100 text-gray-800 border-transparent',
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
