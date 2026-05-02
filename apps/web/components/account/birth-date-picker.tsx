'use client'

import * as React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface BirthDatePickerProps {
    value?: Date
    onChange: (date: Date | undefined) => void
    className?: string
}

export function BirthDatePicker({ value, onChange, className }: BirthDatePickerProps) {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 30 }, (_, i) => currentYear - i)
    const months = [
        { value: 0, label: 'January' },
        { value: 1, label: 'February' },
        { value: 2, label: 'March' },
        { value: 3, label: 'April' },
        { value: 4, label: 'May' },
        { value: 5, label: 'June' },
        { value: 6, label: 'July' },
        { value: 7, label: 'August' },
        { value: 8, label: 'September' },
        { value: 9, label: 'October' },
        { value: 10, label: 'November' },
        { value: 11, label: 'December' },
    ]

    const [year, setYear] = React.useState<string>(value ? value.getFullYear().toString() : '')
    const [month, setMonth] = React.useState<string>(value ? value.getMonth().toString() : '')
    const [day, setDay] = React.useState<string>(value ? value.getDate().toString() : '1')

    // Generate days based on month and year
    const getDaysInMonth = (m: number, y: number) => {
        return new Date(y, m + 1, 0).getDate()
    }

    const daysCount = year && month ? getDaysInMonth(parseInt(month), parseInt(year)) : 31
    const days = Array.from({ length: daysCount }, (_, i) => i + 1)

    React.useEffect(() => {
        if (year && month && day) {
            const newDate = new Date(parseInt(year), parseInt(month), parseInt(day))
            if (!value || value.getTime() !== newDate.getTime()) {
                onChange(newDate)
            }
        } else if (!year && !month && !day && value) {
            onChange(undefined)
        }
    }, [year, month, day])

    return (
        <div className={cn("grid grid-cols-3 gap-2", className)}>
            <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">Year</span>
                <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="h-12 border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus:ring-0">
                        <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="border border-[oklch(85%_0.03_160)] rounded-sm shadow-md">
                        {years.map((y) => (
                            <SelectItem key={y} value={y.toString()} className="font-medium">
                                {y}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">Month</span>
                <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger className="h-12 border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus:ring-0">
                        <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent className="border border-[oklch(85%_0.03_160)] rounded-sm shadow-md">
                        {months.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()} className="font-medium">
                                {m.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">Day</span>
                <Select value={day} onValueChange={setDay}>
                    <SelectTrigger className="h-12 border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus:ring-0">
                        <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent className="border border-[oklch(85%_0.03_160)] rounded-sm shadow-md">
                        {days.map((d) => (
                            <SelectItem key={d} value={d.toString()} className="font-medium">
                                {d}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
