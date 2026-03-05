import { createClient } from '@/lib/supabase/server'
import type { PreorderGroup, PreorderBatch } from '@/lib/types'

export interface ProductPreorderData {
  preorderGroup: PreorderGroup | null
  preorderBatches: PreorderBatch[]
  isPickupOnly: boolean
}

/**
 * Fetch preorder group and batches for a single product
 */
export async function getProductPreorderData(productId: string): Promise<ProductPreorderData> {
  const supabase = await createClient()

  // Fetch product's preorder group assignment
  const { data: assignment } = await supabase
    .from('product_preorder_groups')
    .select('preorder_group_id')
    .eq('product_id', productId)
    .single()

  // Fetch product's pickup_only status
  const { data: product } = await supabase
    .from('products')
    .select('pickup_only')
    .eq('id', productId)
    .single()

  if (!assignment?.preorder_group_id) {
    return {
      preorderGroup: null,
      preorderBatches: [],
      isPickupOnly: product?.pickup_only || false,
    }
  }

  // Fetch the preorder group
  const { data: group } = await supabase
    .from('preorder_groups')
    .select('*')
    .eq('id', assignment.preorder_group_id)
    .eq('is_active', true)
    .single()

  if (!group) {
    return {
      preorderGroup: null,
      preorderBatches: [],
      isPickupOnly: product?.pickup_only || false,
    }
  }

  // Fetch active batches with future arrival dates
  const { data: batches } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('preorder_group_id', assignment.preorder_group_id)
    .eq('is_active', true)
    .gte('arrival_date', new Date().toISOString().split('T')[0])
    .order('arrival_date', { ascending: true })

  return {
    preorderGroup: group as PreorderGroup,
    preorderBatches: (batches || []) as PreorderBatch[],
    isPickupOnly: product?.pickup_only || group.pickup_only,
  }
}
