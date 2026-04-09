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