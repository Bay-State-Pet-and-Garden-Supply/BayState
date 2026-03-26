/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { FloatingActionsBar } from '@/components/admin/pipeline/FloatingActionsBar';
import { PipelineToolbar } from '@/components/admin/pipeline/PipelineToolbar';

describe('published export actions', () => {
    it('renders publish-stage toolbar export actions when nothing is selected', () => {
        const onExportXml = jest.fn();
        const onExportZip = jest.fn();

        render(
            <PipelineToolbar
                totalCount={12}
                currentStage="published"
                isLoading={false}
                search=""
                onSearchChange={() => {}}
                onSelectAll={() => {}}
                selectedCount={0}
                onExportXml={onExportXml}
                onExportZip={onExportZip}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Export ShopSite XML' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export Image ZIP' }));

        expect(onExportXml).toHaveBeenCalledTimes(1);
        expect(onExportZip).toHaveBeenCalledTimes(1);
    });

    it('renders selected export actions in the published floating action bar', () => {
        const onExportXml = jest.fn();
        const onExportZip = jest.fn();

        render(
            <FloatingActionsBar
                selectedCount={3}
                totalCount={12}
                currentStage="published"
                isLoading={false}
                onClearSelection={() => {}}
                onSelectAll={() => {}}
                onBulkAction={() => {}}
                onDelete={() => {}}
                onExportXml={onExportXml}
                onExportZip={onExportZip}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Export XML' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

        expect(onExportXml).toHaveBeenCalledTimes(1);
        expect(onExportZip).toHaveBeenCalledTimes(1);
    });
});
