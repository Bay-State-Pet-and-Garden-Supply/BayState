import type { PreorderGroup, PreorderBatch } from '@/lib/types';
import type { CartItem } from '@/lib/cart-store';
import { createClient } from '@/lib/supabase/server';

export interface ValidationError {
  type: 'pickup_only' | 'batch_minimum' | 'delivery_unavailable';
  message: string;
  batchId?: string;
  currentQuantity?: number;
  minimumQuantity?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  groupedCart?: Map<string, CartItem[]>;
}

export interface GroupedCartItems {
  batchId: string | 'standard';
  batch?: PreorderBatch;
  group?: PreorderGroup;
  items: CartItem[];
  totalQuantity: number;
  minimumQuantity: number;
}

/**
 * Fetch preorder groups and batches for products in cart
 */
export async function fetchPreorderData(
  productIds: string[]
): Promise<{
  groups: Map<string, PreorderGroup>;
  batches: Map<string, PreorderBatch>;
  productGroupMap: Map<string, string>;
}> {
  const supabase = await createClient();

  // Fetch product to preorder group mappings
  const { data: productGroups } = await supabase
    .from('product_preorder_groups')
    .select('product_id, preorder_group_id')
    .in('product_id', productIds);

  const productGroupMap = new Map<string, string>();
  const groupIds = new Set<string>();

  if (productGroups) {
    for (const pg of productGroups) {
      productGroupMap.set(pg.product_id, pg.preorder_group_id);
      groupIds.add(pg.preorder_group_id);
    }
  }

  // Fetch groups
  const { data: groups } = await supabase
    .from('preorder_groups')
    .select('*')
    .in('id', Array.from(groupIds))
    .eq('is_active', true);

  const groupsMap = new Map<string, PreorderGroup>();
  if (groups) {
    for (const g of groups) {
      groupsMap.set(g.id, g as PreorderGroup);
    }
  }

  // Fetch batches for these groups
  const { data: batches } = await supabase
    .from('preorder_batches')
    .select('*')
    .in('preorder_group_id', Array.from(groupIds))
    .eq('is_active', true)
    .gte('arrival_date', new Date().toISOString().split('T')[0])
    .order('arrival_date', { ascending: true });

  const batchesMap = new Map<string, PreorderBatch>();
  if (batches) {
    for (const b of batches) {
      batchesMap.set(b.id, b as PreorderBatch);
    }
  }

  return {
    groups: groupsMap,
    batches: batchesMap,
    productGroupMap,
  };
}

/**
 * Group cart items by preorder batch
 */
export function groupCartByBatch(
  items: CartItem[],
  productGroupMap: Map<string, string>,
  batches: Map<string, PreorderBatch>,
  groups: Map<string, PreorderGroup>
): GroupedCartItems[] {
  const grouped = new Map<string, CartItem[]>();

  for (const item of items) {
    const batchId = item.preorderBatchId || 'standard';
    
    if (!grouped.has(batchId)) {
      grouped.set(batchId, []);
    }
    grouped.get(batchId)!.push(item);
  }

  const result: GroupedCartItems[] = [];

  for (const [batchId, batchItems] of grouped) {
    let minimumQuantity = 1;
    let batch: PreorderBatch | undefined;
    let group: PreorderGroup | undefined;

    if (batchId !== 'standard') {
      batch = batches.get(batchId);
      if (batch) {
        group = groups.get(batch.preorder_group_id);
        if (group) {
          minimumQuantity = group.minimum_quantity;
        }
      }
    }

    const totalQuantity = batchItems.reduce((sum, item) => sum + item.quantity, 0);

    result.push({
      batchId,
      batch,
      group,
      items: batchItems,
      totalQuantity,
      minimumQuantity,
    });
  }

  return result;
}

/**
 * Validate cart for checkout eligibility
 */
export async function validateCartForCheckout(
  cartItems: CartItem[]
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  if (cartItems.length === 0) {
    return { isValid: true, errors: [] };
  }

  // Check for pickup-only items
  const hasPickupOnly = cartItems.some(item => item.pickup_only);
  if (hasPickupOnly) {
    errors.push({
      type: 'pickup_only',
      message: 'Some items in your cart are pickup-only and cannot be delivered.',
    });
  }

  // Fetch preorder data for minimum validation
  const productIds = cartItems.map(item => item.id);
  const { groups, batches, productGroupMap } = await fetchPreorderData(productIds);

  // Group items by batch
  const groupedCart = groupCartByBatch(cartItems, productGroupMap, batches, groups);

  // Check batch minimums
  for (const group of groupedCart) {
    if (group.batchId !== 'standard' && group.group) {
      if (group.totalQuantity < group.minimumQuantity) {
        const batchDate = group.batch?.arrival_date 
          ? new Date(group.batch.arrival_date).toLocaleDateString()
          : 'this batch';
        
        errors.push({
          type: 'batch_minimum',
          message: `${group.group.name} requires a minimum of ${group.minimumQuantity} items for ${batchDate}. You currently have ${group.totalQuantity}.`,
          batchId: group.batchId,
          currentQuantity: group.totalQuantity,
          minimumQuantity: group.minimumQuantity,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    groupedCart: new Map(groupedCart.map(g => [g.batchId, g.items])),
  };
}

/**
 * Get formatted validation error messages for display
 */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map(error => {
    switch (error.type) {
      case 'pickup_only':
        return 'Pickup Required: Some items can only be picked up at our store.';
      case 'batch_minimum':
        return `Minimum Order: ${error.message}`;
      case 'delivery_unavailable':
        return `Delivery Unavailable: ${error.message}`;
      default:
        return error.message;
    }
  });
}

/**
 * Get available delivery services for the cart
 */
export function getAvailableDeliveryServices(
  cartItems: CartItem[],
  preorderGroups: Map<string, PreorderGroup>
): string[] {
  // For v1, all services are available if cart is delivery-eligible
  // Future: could restrict services based on product weight/dimensions
  return ['pallet_jack', 'lift_gate', 'forklift', 'garage_placement'];
}
