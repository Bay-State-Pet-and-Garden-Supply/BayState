import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateProductLineSchema = z.object({
	name: z.string().min(1, 'Name is required').optional(),
	upc_prefix: z
		.string()
		.length(6, 'UPC prefix must be exactly 6 characters')
		.regex(/^\d{6}$/, 'UPC prefix must contain only digits')
		.optional(),
	description: z.string().optional(),
	status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const supabase = await createClient();
		const { id } = await params;

		const { data, error } = await supabase
			.from('product_lines')
			.select('*')
			.eq('id', id)
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json(
				{ error: 'Product line not found' },
				{ status: 404 }
			);
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching product line:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch product line' },
			{ status: 500 }
		);
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const supabase = await createClient();
		const { id } = await params;
		const body = await request.json();
		const validatedData = updateProductLineSchema.parse(body);

		const { data, error } = await supabase
			.from('product_lines')
			.update(validatedData)
			.eq('id', id)
			.select()
			.single();

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A product line with this UPC prefix already exists' },
					{ status: 409 }
				);
			}
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json(
				{ error: 'Product line not found' },
				{ status: 404 }
			);
		}

		return NextResponse.json(data);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation failed', details: error.issues },
				{ status: 400 }
			);
		}
		console.error('Error updating product line:', error);
		return NextResponse.json(
			{ error: 'Failed to update product line' },
			{ status: 500 }
		);
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const supabase = await createClient();
		const { id } = await params;

		const { error } = await supabase.from('product_lines').delete().eq('id', id);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting product line:', error);
		return NextResponse.json(
			{ error: 'Failed to delete product line' },
			{ status: 500 }
		);
	}
}
