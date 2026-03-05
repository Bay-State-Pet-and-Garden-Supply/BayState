/**
 * Core domain types for the storefront.
 * These types match the database schema and views.
 */

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at?: string;
}

export interface Product {
  id: string;
  brand_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  images: string[];
  is_featured: boolean;
  is_special_order: boolean;
  pickup_only?: boolean;
  weight: number | null;
  search_keywords: string | null;
  category_id: string | null;
  created_at: string;
  // New enrichment fields
  compare_at_price: number | null;
  cost_price: number | null;
  quantity: number;
  low_stock_threshold: number;
  is_taxable: boolean;
  tax_code: string | null;
  barcode: string | null;
  meta_title: string | null;
  meta_description: string | null;
  dimensions: { length?: number; width?: number; height?: number; unit?: string } | null;
  origin_country: string | null;
  vendor: string | null;
  published_at: string | null;
  avg_rating: number | null;
  review_count: number;
  // Relations
  brand?: Brand;
  category?: Category;
  variants?: ProductVariant[];
  product_images?: ProductImage[];
  reviews?: ProductReview[];
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface PetType {
  id: string;
  name: string;
  display_order: number;
  icon: string | null;
}

// Structured attribute types that align with product classification
export type PetLifeStage = 'puppy' | 'kitten' | 'juvenile' | 'adult' | 'senior';
export type PetSizeClass = 'small' | 'medium' | 'large' | 'giant';
export type PetSpecialNeed = 
  | 'grain-free' 
  | 'sensitive-stomach' 
  | 'weight-management' 
  | 'high-protein' 
  | 'limited-ingredient'
  | 'dental-care'
  | 'joint-support'
  | 'skin-coat';
export type PetGender = 'male' | 'female';
export type PetActivityLevel = 'low' | 'moderate' | 'high' | 'very_high';

export interface Pet {
  id: string;
  user_id: string;
  pet_type_id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  weight_lbs: number | null;
  dietary_notes: string | null;
  // New structured attributes for filtering/recommendations
  life_stage: PetLifeStage | null;
  size_class: PetSizeClass | null;
  special_needs: PetSpecialNeed[];
  gender: PetGender | null;
  is_fixed: boolean | null;
  activity_level: PetActivityLevel | null;
  created_at: string;
  updated_at: string;
  pet_type?: PetType;
}

// Constants for form dropdowns
export const PET_LIFE_STAGES: { value: PetLifeStage; label: string; description: string }[] = [
  { value: 'puppy', label: 'Puppy', description: 'Dogs under 1 year' },
  { value: 'kitten', label: 'Kitten', description: 'Cats under 1 year' },
  { value: 'juvenile', label: 'Juvenile', description: 'Young pets 1-2 years' },
  { value: 'adult', label: 'Adult', description: 'Fully grown pets' },
  { value: 'senior', label: 'Senior', description: 'Older pets 7+ years' },
];

export const PET_SIZE_CLASSES: { value: PetSizeClass; label: string; weightRange: string }[] = [
  { value: 'small', label: 'Small', weightRange: 'Under 20 lbs' },
  { value: 'medium', label: 'Medium', weightRange: '20-50 lbs' },
  { value: 'large', label: 'Large', weightRange: '50-100 lbs' },
  { value: 'giant', label: 'Giant', weightRange: 'Over 100 lbs' },
];

export const PET_SPECIAL_NEEDS: { value: PetSpecialNeed; label: string }[] = [
  { value: 'grain-free', label: 'Grain Free' },
  { value: 'sensitive-stomach', label: 'Sensitive Stomach' },
  { value: 'weight-management', label: 'Weight Management' },
  { value: 'high-protein', label: 'High Protein' },
  { value: 'limited-ingredient', label: 'Limited Ingredient' },
  { value: 'dental-care', label: 'Dental Care' },
  { value: 'joint-support', label: 'Joint Support' },
  { value: 'skin-coat', label: 'Skin & Coat' },
];

export const PET_ACTIVITY_LEVELS: { value: PetActivityLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Mostly relaxed, short walks' },
  { value: 'moderate', label: 'Moderate', description: 'Regular walks, some play' },
  { value: 'high', label: 'High', description: 'Very active, lots of exercise' },
  { value: 'very_high', label: 'Very High', description: 'Working dog, athlete' },
];

// ============================================================================
// Product Reviews & Q&A
// ============================================================================

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string | null;
  content: string | null;
  pros: string[] | null;
  cons: string[] | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  user?: { full_name: string | null };
}

export interface ReviewHelpfulVote {
  user_id: string;
  review_id: string;
  is_helpful: boolean;
  created_at: string;
}

export interface ProductQuestion {
  id: string;
  product_id: string;
  user_id: string | null;
  question: string;
  status: ReviewStatus;
  created_at: string;
  user?: { full_name: string | null };
  answers?: ProductAnswer[];
}

export interface ProductAnswer {
  id: string;
  question_id: string;
  user_id: string | null;
  answer: string;
  is_official: boolean;
  helpful_count: number;
  created_at: string;
  user?: { full_name: string | null };
}

// ============================================================================
// Product Variants & Options
// ============================================================================

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  position: number;
  created_at: string;
  values?: ProductOptionValue[];
}

export interface ProductOptionValue {
  id: string;
  option_id: string;
  value: string;
  position: number;
  color_hex: string | null;
  image_url: string | null;
  created_at: string;
}

export type WeightUnit = 'lb' | 'oz' | 'kg' | 'g';

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  title: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  quantity: number;
  weight: number | null;
  weight_unit: WeightUnit;
  option_values: Array<{ option_id: string; value_id: string }>;
  image_url: string | null;
  is_default: boolean;
  requires_shipping: boolean;
  is_taxable: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Product Groups (Amazon-style size grouping)
// ============================================================================

/**
 * A group of related products sharing a single product page.
 * Example: Blue Buffalo Dog Food in 5lb, 15lb, 30lb sizes.
 */
export interface ProductGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hero_image_url: string | null;
  default_product_id: string | null;
  brand_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations populated when fetching
  members?: ProductGroupMember[];
  brand?: Brand;
}

/**
 * A product member of a group.
 */
export interface ProductGroupMember {
  group_id: string;
  product_id: string;
  sort_order: number;
  is_default: boolean;
  display_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // Relation populated when fetching
  product?: Product;
}

/**
 * Response when fetching a group by slug.
 * Includes the group info and all member products.
 */
export interface ProductGroupWithMembers {
  group: ProductGroup;
  members: Array<{
    member: ProductGroupMember;
    product: Product;
  }>;
  defaultMember: ProductGroupMember | null;
}

// ============================================================================
// Product Images
// ============================================================================

export interface ProductImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  url: string;
  alt_text: string | null;
  position: number;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  created_at: string;
}

// ============================================================================
// Tags & Attributes
// ============================================================================

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface ProductTag {
  product_id: string;
  tag_id: string;
}

export interface ProductAttribute {
  id: string;
  product_id: string;
  key: string;
  value: string;
  is_filterable: boolean;
  created_at: string;
}

// ============================================================================
// User Activity & Recommendations
// ============================================================================

export interface RecentlyViewed {
  user_id: string;
  product_id: string;
  viewed_at: string;
  product?: Product;
}

export type RelationType = 'related' | 'upsell' | 'cross_sell' | 'bundle' | 'accessory' | 'frequently_bought';

export interface RelatedProduct {
  product_id: string;
  related_product_id: string;
  relation_type: RelationType;
  position: number;
  created_at: string;
  related_product?: Product;
}

// ============================================================================
// Price History
// ============================================================================


export interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  is_published: boolean;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreorderGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  minimum_quantity: number;
  pickup_only: boolean;
  display_copy: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PreorderBatch {
  id: string;
  preorder_group_id: string;
  arrival_date: string;
  ordering_deadline: string | null;
  capacity: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DeliveryServiceType = 'pallet_jack' | 'lift_gate' | 'forklift' | 'garage_placement';

export interface DeliveryServiceOption {
  service: DeliveryServiceType;
  fee: number;
  label: string;
}

export const DELIVERY_SERVICE_OPTIONS: DeliveryServiceOption[] = [
  { service: 'pallet_jack', fee: 25, label: 'Pallet Jack (+$25)' },
  { service: 'lift_gate', fee: 50, label: 'Lift Gate (+$50)' },
  { service: 'forklift', fee: 75, label: 'Forklift Delivery (+$75)' },
  { service: 'garage_placement', fee: 25, label: 'Garage Placement (+$25)' },
];

// ============================================================================
// Checkout Types
// ============================================================================

export interface CheckoutUserData {
  fullName: string;
  email: string;
  phone: string;
}

// Tax rate constant
export const TAX_RATE = 0.0625; // 6.25%
