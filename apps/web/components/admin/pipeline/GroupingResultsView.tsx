'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin/api-client';

interface ProductInfo {
    upc: string;
    input: any;
    product_line_confidence: number | null;
    product_line_assignment_source: 'ai' | 'manual' | 'migration' | null;
    product_line_review_required: boolean;
}

interface GroupData {
    product_line_id: string;
    product_line_name: string;
    products: ProductInfo[];
    review_required_count: number;
    ready: boolean;
    review_required_products: string[];
}

interface UngroupedData {
    upc: string;
    input: any;
    accepted: boolean;
    product_line_confidence: number | null;
    product_line_raw_label: string | null;
}

interface GroupingData {
    groups: GroupData[];
    ungrouped: UngroupedData[];
    ready_group_count: number;
    needs_review_group_count: number;
    accepted_singleton_count: number;
    needs_review_singleton_count: number;
    total_grouped: number;
    total_ungrouped: number;
}

import GroupingReviewStep from './grouping/GroupingReviewStep';
import GroupingEditStep from './grouping/GroupingEditStep';
import GroupingConsolidateStep from './grouping/GroupingConsolidateStep';

type Step = 'review' | 'edit' | 'consolidate';

interface GroupingResultsViewProps {
    onConsolidateGroups?: (groups: Array<{ product_line_id: string; upcs: string[] }>) => void;
    onStageChange?: (stage: string) => void;
    onRefresh?: () => Promise<void>;
}

export default function GroupingResultsView({ onStageChange }: GroupingResultsViewProps) {
    const [activeStep, setActiveStep] = useState<Step>('review');
    const [data, setData] = useState<GroupingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminFetch('/api/admin/grouping/groups');
            if (res.ok) setData(await res.json());
            else setError((await res.json()).error || 'Failed to fetch groups');
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    // useEffect fires on mount; refreshData is stable, setState is safe here
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    useEffect(() => {
        refreshData();
    }, []);

    if (loading && !data) {
        return <div className="p-6 text-gray-500">Loading product groups...</div>;
    }

    if (error && !data) {
        return <div className="p-6 text-red-500">Error: {error}</div>;
    }

    if (!data) {
        return <div className="p-6 text-gray-500">Loading product groups...</div>;
    }

    const needsReviewCount = (data.needs_review_group_count || 0) + (data.needs_review_singleton_count || 0);
    const readyCount = (data.ready_group_count || 0) + (data.accepted_singleton_count || 0);
    const steps: Array<{ key: Step; label: string; count?: number }> = [
        { key: 'review', label: 'Review', count: needsReviewCount },
        { key: 'edit', label: 'Edit' },
        { key: 'consolidate', label: 'Consolidate', count: readyCount },
    ];

    return (
        <div className="p-6">
            {/* Summary header */}
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Product Groups</h2>
                <p className="text-sm text-gray-500">
                    {data.total_grouped} products in {data.groups.length} groups
                    {data.total_ungrouped > 0 && `, ${data.total_ungrouped} ungrouped`}
                </p>
            </div>

            {/* Step Navigation */}
            <div className="flex gap-1 mb-6 border-b">
                {steps.map(s => (
                    <button
                        key={s.key}
                        onClick={() => setActiveStep(s.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeStep === s.key
                                ? 'border-purple-600 text-purple-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {s.label}
                        {s.count !== undefined && (
                            <span
                                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                                    s.count > 0 && s.key === 'review'
                                        ? 'bg-amber-100 text-amber-700'
                                        : s.count > 0
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-gray-100 text-gray-500'
                                }`}
                            >
                                {s.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Step Content */}
            {activeStep === 'review' && (
                <GroupingReviewStep
                    groups={data.groups}
                    ungrouped={data.ungrouped}
                    onRefresh={refreshData}
                    onNavigateStep={(step: string) => setActiveStep(step as Step)}
                />
            )}
            {activeStep === 'edit' && (
                <GroupingEditStep
                    groups={data.groups}
                    onRefresh={refreshData}
                    onNavigateStep={(step: string) => setActiveStep(step as Step)}
                />
            )}
            {activeStep === 'consolidate' && (
                <GroupingConsolidateStep
                    groups={data.groups}
                    ungrouped={data.ungrouped}
                    onStageChange={onStageChange || (() => {})}
                    onRefresh={refreshData}
                />
            )}
        </div>
    );
}
