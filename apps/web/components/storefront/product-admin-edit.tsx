'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductEditModal, PublishedProduct } from '@/components/admin/products/ProductEditModal';

interface ProductAdminEditProps {
    /** Product data for the edit modal */
    product: PublishedProduct;
}

/**
 * Admin-only edit button that opens the product edit modal.
 * This component is only rendered when the user has admin/staff role.
 */
export function ProductAdminEdit({ product }: ProductAdminEditProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleSave = () => {
        // Refresh the page to show updated data
        window.location.reload();
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="gap-2"
            >
                <Pencil className="h-4 w-4" />
                Edit Product
            </Button>

            {isOpen && (
                <ProductEditModal
                    product={product}
                    onClose={() => setIsOpen(false)}
                    onSave={handleSave}
                />
            )}
        </>
    );
}
