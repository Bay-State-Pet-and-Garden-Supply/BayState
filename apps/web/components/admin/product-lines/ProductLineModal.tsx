'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const productLineSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	upc_prefix: z
		.string()
		.length(6, 'UPC prefix must be exactly 6 characters')
		.regex(/^\d{6}$/, 'UPC prefix must contain only digits'),
	description: z.string().optional(),
	status: z.enum(['active', 'inactive']),
});

type ProductLineFormData = z.infer<typeof productLineSchema>;

export interface ProductLine {
	id: string;
	name: string;
	upc_prefix: string;
	description: string | null;
	status: 'active' | 'inactive';
	product_count: number;
	created_at: string;
	updated_at: string;
}

interface ProductLineModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	productLine?: ProductLine | null;
	onSave: (data: ProductLineFormData) => Promise<void>;
}

export function ProductLineModal({
	open,
	onOpenChange,
	productLine,
	onSave,
}: ProductLineModalProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		setValue,
		reset,
		formState: { errors },
	} = useForm<ProductLineFormData>({
		resolver: zodResolver(productLineSchema),
		defaultValues: productLine
			? {
					name: productLine.name,
					upc_prefix: productLine.upc_prefix,
					description: productLine.description || '',
					status: productLine.status,
			  }
			: {
					name: '',
					upc_prefix: '',
					description: '',
					status: 'active',
			  },
	});

	const onSubmit = async (data: ProductLineFormData) => {
		setIsSubmitting(true);
		try {
			await onSave(data);
			onOpenChange(false);
			reset();
		} catch (error) {
			console.error('Failed to save product line:', error);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>
						{productLine ? 'Edit Product Line' : 'Add Product Line'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							{...register('name')}
							placeholder="e.g., Premium Dog Food"
						/>
						{errors.name && (
							<p className="text-sm text-destructive">{errors.name.message}</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="upc_prefix">UPC Prefix</Label>
						<Input
							id="upc_prefix"
							{...register('upc_prefix')}
							placeholder="e.g., 012345"
							maxLength={6}
						/>
						{errors.upc_prefix && (
							<p className="text-sm text-destructive">
								{errors.upc_prefix.message}
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							6-digit prefix that identifies products in this line
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description (Optional)</Label>
						<Textarea
							id="description"
							{...register('description')}
							placeholder="Brief description of this product line"
							rows={3}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="status">Status</Label>
						<Select
							defaultValue={productLine?.status || 'active'}
							onValueChange={(value) =>
								setValue('status', value as 'active' | 'inactive')
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							{productLine ? 'Save Changes' : 'Add Product Line'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}