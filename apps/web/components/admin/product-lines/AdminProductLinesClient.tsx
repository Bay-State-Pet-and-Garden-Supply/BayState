'use client';

import { useState } from 'react';
import { Plus, Search, Filter, Eye, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { DataTable, type Column } from '@/components/admin/data-table';
import { ProductLineModal, type ProductLine } from './ProductLineModal';

interface AdminProductLinesClientProps {
	initialProductLines: ProductLine[];
	totalCount: number;
}

export function AdminProductLinesClient({
	initialProductLines,
	totalCount,
}: AdminProductLinesClientProps) {
	const [productLines, setProductLines] = useState<ProductLine[]>(initialProductLines);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedProductLine, setSelectedProductLine] = useState<ProductLine | null>(null);
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<string>('all');

	const filteredProductLines = productLines.filter((pl) => {
		const matchesSearch =
			search === '' ||
			pl.name.toLowerCase().includes(search.toLowerCase()) ||
			pl.upc_prefix.includes(search);
		const matchesStatus = statusFilter === 'all' || pl.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	const columns: Column<ProductLine>[] = [
		{
			key: 'name',
			header: 'Product Line',
			sortable: true,
			searchable: true,
			render: (value, row) => (
				<div>
					<div className="font-medium">{row.name}</div>
					{row.description && (
						<div className="text-sm text-muted-foreground truncate max-w-xs">
							{row.description}
						</div>
					)}
				</div>
			),
		},
		{
			key: 'upc_prefix',
			header: 'UPC Prefix',
			sortable: true,
			searchable: true,
			render: (value) => (
				<code className="px-2 py-1 bg-muted rounded text-sm font-mono">
					{value as string}
				</code>
			),
		},
		{
			key: 'product_count',
			header: 'Products',
			sortable: true,
			render: (value) => (
				<Badge variant="secondary" className="font-mono">
					{value as number}
				</Badge>
			),
		},
		{
			key: 'status',
			header: 'Status',
			sortable: true,
			render: (value) => (
				<Badge
					variant={(value as string) === 'active' ? 'default' : 'secondary'}
					className={
						(value as string) === 'active'
							? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
							: ''
					}
				>
					{(value as string).charAt(0).toUpperCase() + (value as string).slice(1)}
				</Badge>
			),
		},
		{
			key: 'updated_at',
			header: 'Last Updated',
			sortable: true,
			render: (value) => {
				const date = new Date(value as string);
				return (
					<span className="text-sm text-muted-foreground">
						{date.toLocaleDateString()} {date.toLocaleTimeString()}
					</span>
				);
			},
		},
	];

	const handleAddNew = () => {
		setSelectedProductLine(null);
		setIsModalOpen(true);
	};

	const handleEdit = (productLine: ProductLine) => {
		setSelectedProductLine(productLine);
		setIsModalOpen(true);
	};

	const handleSave = async (data: {
		name: string;
		upc_prefix: string;
		description?: string;
		status: 'active' | 'inactive';
	}) => {
		const url = selectedProductLine
			? `/api/admin/product-lines/${selectedProductLine.id}`
			: '/api/admin/product-lines';
		const method = selectedProductLine ? 'PUT' : 'POST';

		const response = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			throw new Error('Failed to save product line');
		}

		const savedProductLine = await response.json();

		if (selectedProductLine) {
			setProductLines((prev) =>
				prev.map((pl) => (pl.id === savedProductLine.id ? savedProductLine : pl))
			);
		} else {
			setProductLines((prev) => [...prev, savedProductLine]);
		}
	};

	const handleView = (productLine: ProductLine) => {
		window.location.href = `/admin/product-lines/${productLine.id}`;
	};

	const handleProcess = (productLine: ProductLine) => {
		window.location.href = `/admin/pipeline?productLine=${productLine.id}`;
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Product Lines</h1>
					<p className="text-muted-foreground">
						Manage product lines for cohort-based processing
					</p>
				</div>
				<Button onClick={handleAddNew}>
					<Plus className="mr-2 h-4 w-4" />
					Add Product Line
				</Button>
			</div>

			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative max-w-sm flex-1">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search by name or UPC prefix..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Filter className="h-4 w-4 text-muted-foreground" />
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="w-[150px]">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<DataTable
				data={filteredProductLines}
				columns={columns}
				searchPlaceholder="Search product lines..."
				pageSize={10}
				actions={(row) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleView(row)}
							title="View details"
						>
							<Eye className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleProcess(row)}
							title="Process products"
						>
							<Play className="h-4 w-4" />
						</Button>
						<Button variant="ghost" size="sm" onClick={() => handleEdit(row)}>
							Edit
						</Button>
					</div>
				)}
			/>

			<ProductLineModal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				productLine={selectedProductLine}
				onSave={handleSave}
			/>
		</div>
	);
}