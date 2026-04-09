import { createClient } from '@/lib/supabase/server';
import { AdminProductLinesClient } from '@/components/admin/product-lines/AdminProductLinesClient';
import { type ProductLine } from '@/components/admin/product-lines/ProductLineModal';
import { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'Product Lines | Bay State Pet Admin',
	description: 'Monitor product lines for cohort-based processing.',
};

export default async function AdminProductLinesPage() {
	const supabase = await createClient();
	const { data: productLines, count } = await supabase
		.from('product_lines')
		.select('*', { count: 'exact' })
		.order('name');

	return (
		<AdminProductLinesClient
			initialProductLines={(productLines || []) as ProductLine[]}
			totalCount={count || 0}
		/>
	);
}