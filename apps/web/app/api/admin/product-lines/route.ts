import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createProductLineSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	upc_prefix: z
		.string()
		.length(6, 'UPC prefix must be exactly 6 characters')
		.regex(/^\d{6}$/, 'UPC prefix must contain only digits'),
	description: z.string().optional(),
	status: z.enum(['active', 'inactive']).default('active'),
});

export async function GET() {
	try {
		const supabase = await createClient();
		const { data, error } = await supabase
			.from('product_lines')
			.select('*')
			.order('name');

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching product lines:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch product lines' },
			{ status: 500 }
		);
	}
}

export async function POST(request: Request) {
	try {
		const supabase = await createClient();
		const body = await request.json();
		const validatedData = createProductLineSchema.parse(body);

		const { data, error } = await supabase
			.from('product_lines')
			.insert({
				name: validatedData.name,
				upc_prefix: validatedData.upc_prefix,
				description: validatedData.description || null,
				status: validatedData.status,
				product_count: 0,
			})
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

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation failed', details: error.issues },
				{ status: 400 }
			);
		}
		console.error('Error creating product line:', error);
		return NextResponse.json(
			{ error: 'Failed to create product line' },
			{ status: 500 }
		);
	}
}
