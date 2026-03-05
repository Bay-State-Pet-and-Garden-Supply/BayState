export interface Address {
    id: string;
    user_id: string;
    full_name: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip_code: string;
    phone: string | null;
    is_default: boolean;
    created_at: string;
}

export interface ProductSummary {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: string[];
    stock_status: string;
}
