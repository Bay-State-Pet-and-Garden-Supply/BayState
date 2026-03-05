'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useState } from 'react';

interface DownloadXmlButtonsProps {
    className?: string;
}

export function DownloadXmlButtons({ className }: DownloadXmlButtonsProps) {
    const [downloading, setDownloading] = useState<string | null>(null);

    const handleDownload = async (type: 'products' | 'orders' | 'customers') => {
        setDownloading(type);
        try {
            const response = await fetch(`/api/admin/migration/download?type=${type}`);

            if (!response.ok) {
                const errorData = await response.json();
                alert(`Download failed: ${errorData.error || 'Unknown error'}`);
                return;
            }

            // Try to get filename from header
            let filename = `shopsite-${type}-${new Date().toISOString().split('T')[0]}.xml`;
            const disposition = response.headers.get('Content-Disposition');
            if (disposition && disposition.indexOf('filename=') !== -1) {
                const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            // Get the blob and create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; // Ensure it's hidden
            a.href = url;
            a.download = filename;

            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);

        } catch (err) {
            alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setDownloading(null);
        }
    };

    return (
        <div className={className}>
            <p className="text-sm font-medium mb-2">Download Raw XML</p>
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('products')}
                    disabled={downloading !== null}
                >
                    <Download className="mr-2 h-4 w-4" />
                    {downloading === 'products' ? 'Downloading...' : 'Products'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('orders')}
                    disabled={downloading !== null}
                >
                    <Download className="mr-2 h-4 w-4" />
                    {downloading === 'orders' ? 'Downloading...' : 'Orders'}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('customers')}
                    disabled={downloading !== null}
                >
                    <Download className="mr-2 h-4 w-4" />
                    {downloading === 'customers' ? 'Downloading...' : 'Customers'}
                </Button>
            </div>
        </div>
    );
}
