/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { FloatingActionsBar } from '@/components/admin/pipeline/FloatingActionsBar';
import { PipelineToolbar } from '@/components/admin/pipeline/PipelineToolbar';

describe('published export actions', () => {
    it('renders publish-stage toolbar export actions when nothing is selected', () => {
        const onUploadShopSite = jest.fn();
        const onDownloadZip = jest.fn();

        render(
            <PipelineToolbar
                totalCount={12}
                currentStage="published"
                isLoading={false}
                search=""
                onSearchChange={() => {}}
                onSelectAll={() => {}}
                selectedCount={0}
                onUploadShopSite={onUploadShopSite}
                onDownloadZip={onDownloadZip}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload to ShopSite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Download Image ZIP' }));

        expect(onUploadShopSite).toHaveBeenCalledTimes(1);
        expect(onDownloadZip).toHaveBeenCalledTimes(1);
    });

    it('renders selected export actions in the published floating action bar', () => {
        const onUploadShopSite = jest.fn();
        const onDownloadZip = jest.fn();

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
                onUploadShopSite={onUploadShopSite}
                onDownloadZip={onDownloadZip}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload to ShopSite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));

        expect(onUploadShopSite).toHaveBeenCalledTimes(1);
        expect(onDownloadZip).toHaveBeenCalledTimes(1);
    });
});
