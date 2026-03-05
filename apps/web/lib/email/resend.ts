import { Resend } from 'resend';
import { render } from '@react-email/components';
import { OrderConfirmationEmail } from './templates/order-confirmation';
import type { Order } from '@/lib/orders';
import { createClient } from '@/lib/supabase/server';

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const FROM_EMAIL = 'Bay State Pet & Garden <orders@baystatepet.com>';

interface PetRecommendation {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  slug: string;
  petTypeName: string;
}

async function getPetRecommendationsForUser(
  userId: string | null
): Promise<PetRecommendation[]> {
  if (!userId) return [];

  const supabase = await createClient();

  const { data: userPets } = await supabase
    .from('user_pets')
    .select('pet_type_id, pet_type:pet_types(name)')
    .eq('user_id', userId)
    .limit(3);

  if (!userPets || userPets.length === 0) return [];

  const petTypeIds = [...new Set(userPets.map((p) => p.pet_type_id))];

  const { data: products } = await supabase.rpc('get_products_for_pet_types', {
    pet_type_ids: petTypeIds,
  });

  if (!products) return [];

  const petTypeMap = new Map<string, string>();
  for (const pet of userPets) {
    const petTypeData = pet.pet_type;
    if (petTypeData && !Array.isArray(petTypeData)) {
      petTypeMap.set(pet.pet_type_id, (petTypeData as { name: string }).name);
    }
  }

  return products.slice(0, 6).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    price: row.price as number,
    imageUrl: Array.isArray(row.images) && row.images.length > 0
      ? (row.images[0] as string)
      : null,
    slug: row.slug as string,
    petTypeName: petTypeMap.get(row.pet_type_id as string) || 'Pet',
  }));
}

export async function sendOrderConfirmationEmail(
  order: Order
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('Resend not configured - skipping order confirmation email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const petRecommendations = await getPetRecommendationsForUser(order.user_id);
    const customerFirstName = order.customer_name.split(' ')[0];

    const emailHtml = await render(
      OrderConfirmationEmail({
        order,
        petRecommendations,
        customerFirstName,
      })
    );

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: order.customer_email,
      subject: `Order #${order.order_number} Confirmed - Bay State Pet & Garden`,
      html: emailHtml,
    });

    if (error) {
      console.error('Failed to send order confirmation email:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error sending order confirmation email:', err);
    return { success: false, error: 'Failed to send email' };
  }
}
