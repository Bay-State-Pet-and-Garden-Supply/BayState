import { render, screen } from '@testing-library/react';
import { AdminProductLinesClient } from '@/components/admin/product-lines/AdminProductLinesClient';
import type { ProductLine } from '@/components/admin/product-lines/ProductLineModal';

const mockProductLines: ProductLine[] = [
	{
		id: '1',
		name: 'Premium Dog Food',
		upc_prefix: '012345',
		description: 'High-quality dog food products',
		status: 'active',
		product_count: 150,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-15T12:00:00Z',
	},
	{
		id: '2',
		name: 'Cat Litter',
		upc_prefix: '098765',
		description: 'Various cat litter products',
		status: 'active',
		product_count: 75,
		created_at: '2024-01-02T00:00:00Z',
		updated_at: '2024-01-16T12:00:00Z',
	},
	{
		id: '3',
		name: 'Bird Seeds',
		upc_prefix: '111111',
		description: null,
		status: 'inactive',
		product_count: 30,
		created_at: '2024-01-03T00:00:00Z',
		updated_at: '2024-01-17T12:00:00Z',
	},
];

describe('AdminProductLinesClient', () => {
	it('renders product lines list', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		expect(screen.getByText('Product Lines')).toBeInTheDocument();
		expect(screen.getByText('Premium Dog Food')).toBeInTheDocument();
		expect(screen.getByText('Cat Litter')).toBeInTheDocument();
		expect(screen.getByText('Bird Seeds')).toBeInTheDocument();
	});

	it('displays UPC prefixes correctly', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		expect(screen.getByText('012345')).toBeInTheDocument();
		expect(screen.getByText('098765')).toBeInTheDocument();
		expect(screen.getByText('111111')).toBeInTheDocument();
	});

	it('shows product counts', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		expect(screen.getByText('150')).toBeInTheDocument();
		expect(screen.getByText('75')).toBeInTheDocument();
		expect(screen.getByText('30')).toBeInTheDocument();
	});

	it('displays status badges', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		const activeBadges = screen.getAllByText('Active');
		const inactiveBadges = screen.getAllByText('Inactive');

		expect(activeBadges).toHaveLength(2);
		expect(inactiveBadges).toHaveLength(1);
	});

	it('has Add Product Line button', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		expect(screen.getByText('Add Product Line')).toBeInTheDocument();
	});

	it('has search input', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		expect(
			screen.getByPlaceholderText('Search by name or UPC prefix...')
		).toBeInTheDocument();
	});

	it('has status filter', () => {
		render(
			<AdminProductLinesClient
				initialProductLines={mockProductLines}
				totalCount={3}
			/>
		);

		const comboboxes = screen.getAllByRole('combobox');
		expect(comboboxes.length).toBeGreaterThan(0);
	});
});