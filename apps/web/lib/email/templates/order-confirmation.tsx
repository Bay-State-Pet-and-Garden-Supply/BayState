import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from '@react-email/components';
import type { Order, OrderItem } from '@/lib/orders';

interface PetRecommendation {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  slug: string;
  petTypeName: string;
}

interface OrderConfirmationEmailProps {
  order: Order;
  petRecommendations?: PetRecommendation[];
  customerFirstName: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://baystatepet.com';

export function OrderConfirmationEmail({
  order,
  petRecommendations = [],
  customerFirstName,
}: OrderConfirmationEmailProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  return (
    <Html>
      <Head />
      <Preview>
        Order #{order.order_number} confirmed - Thank you for your order!
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Bay State Pet & Garden</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={h2}>
              Order Confirmed! 🎉
            </Heading>
            <Text style={text}>
              Hi {customerFirstName}, thank you for your order! We&apos;re preparing it now.
            </Text>
            <Text style={orderNumber}>Order #{order.order_number}</Text>
          </Section>

          <Hr style={hr} />

          <Section style={content}>
            <Heading as="h3" style={h3}>
              Order Summary
            </Heading>
            {order.items?.map((item: OrderItem) => (
              <Row key={item.id} style={itemRow}>
                <Column style={itemName}>
                  <Text style={text}>
                    {item.item_name} × {item.quantity}
                  </Text>
                </Column>
                <Column style={itemPrice}>
                  <Text style={text}>{formatCurrency(item.total_price)}</Text>
                </Column>
              </Row>
            ))}

            <Hr style={hr} />

            <Row style={totalRow}>
              <Column style={itemName}>
                <Text style={text}>Subtotal</Text>
              </Column>
              <Column style={itemPrice}>
                <Text style={text}>{formatCurrency(order.subtotal)}</Text>
              </Column>
            </Row>
            <Row style={totalRow}>
              <Column style={itemName}>
                <Text style={text}>Tax</Text>
              </Column>
              <Column style={itemPrice}>
                <Text style={text}>{formatCurrency(order.tax)}</Text>
              </Column>
            </Row>
            <Row style={totalRow}>
              <Column style={itemName}>
                <Text style={totalText}>Total</Text>
              </Column>
              <Column style={itemPrice}>
                <Text style={totalText}>{formatCurrency(order.total)}</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={hr} />

          <Section style={content}>
            <Heading as="h3" style={h3}>
              What&apos;s Next?
            </Heading>
            <Text style={text}>
              📧 We&apos;ll email you when your order is ready for pickup.
            </Text>
            <Text style={text}>
              📍 Pickup at: 429 Winthrop Street, Taunton, MA 02780
            </Text>
            <Text style={text}>
              🕐 Store Hours: Mon-Fri 8am-7pm, Sat 8am-6pm, Sun 8am-5pm
            </Text>
          </Section>

          {petRecommendations.length > 0 && (
            <>
              <Hr style={hr} />
              <Section style={content}>
                <Heading as="h3" style={h3}>
                  Recommended for Your Pets 🐾
                </Heading>
                <Text style={textMuted}>
                  Based on your pet profiles, you might also like:
                </Text>
                <Row>
                  {petRecommendations.slice(0, 3).map((product) => (
                    <Column key={product.id} style={productCard}>
                      {product.imageUrl && (
                        <Img
                          src={product.imageUrl}
                          alt={product.name}
                          width="120"
                          height="120"
                          style={productImage}
                        />
                      )}
                      <Text style={productName}>{product.name}</Text>
                      <Text style={productPrice}>
                        {formatCurrency(product.price)}
                      </Text>
                      <Text style={petBadge}>For {product.petTypeName}s</Text>
                      <Link
                        href={`${baseUrl}/products/${product.slug}`}
                        style={productLink}
                      >
                        View Product →
                      </Link>
                    </Column>
                  ))}
                </Row>
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or call us at (508) 821-3704
            </Text>
            <Text style={footerText}>
              Bay State Pet & Garden Supply
              <br />
              429 Winthrop Street, Taunton, MA 02780
            </Text>
            <Link href={baseUrl} style={footerLink}>
              Visit our website
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  backgroundColor: '#16a34a',
  padding: '24px',
  textAlign: 'center' as const,
};

const content = {
  padding: '0 24px',
};

const h1 = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
  textAlign: 'center' as const,
};

const h2 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  margin: '24px 0 16px',
};

const h3 = {
  color: '#1f2937',
  fontSize: '18px',
  fontWeight: '600',
  margin: '24px 0 12px',
};

const text = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
};

const textMuted = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const orderNumber = {
  color: '#16a34a',
  fontSize: '20px',
  fontWeight: '700',
  margin: '16px 0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const itemRow = {
  marginBottom: '8px',
};

const itemName = {
  width: '70%',
};

const itemPrice = {
  width: '30%',
  textAlign: 'right' as const,
};

const totalRow = {
  marginTop: '4px',
};

const totalText = {
  color: '#1f2937',
  fontSize: '16px',
  fontWeight: '700',
  lineHeight: '24px',
  margin: '0',
};

const productCard = {
  padding: '12px',
  textAlign: 'center' as const,
  verticalAlign: 'top' as const,
  width: '33%',
};

const productImage = {
  borderRadius: '8px',
  objectFit: 'cover' as const,
};

const productName = {
  color: '#1f2937',
  fontSize: '12px',
  fontWeight: '600',
  margin: '8px 0 4px',
};

const productPrice = {
  color: '#16a34a',
  fontSize: '14px',
  fontWeight: '700',
  margin: '0',
};

const petBadge = {
  backgroundColor: '#fef3c7',
  borderRadius: '4px',
  color: '#92400e',
  display: 'inline-block',
  fontSize: '10px',
  margin: '4px 0',
  padding: '2px 6px',
};

const productLink = {
  color: '#16a34a',
  fontSize: '12px',
  textDecoration: 'none',
};

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#6b7280',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0 0 8px',
};

const footerLink = {
  color: '#16a34a',
  fontSize: '12px',
  textDecoration: 'none',
};
