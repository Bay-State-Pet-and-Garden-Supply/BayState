import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native'
import { trpc } from '../lib/trpc'
import { useAuth } from '../providers/auth-provider'
import { useCart } from '../providers/cart-provider'

export default function CheckoutScreen() {
  const router = useRouter()
  const { session } = useAuth()
  const { items, clearCart } = useCart()

  const [promoCode, setPromoCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState(session?.user.email || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const checkoutItems = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
      })),
    [items],
  )

  const quoteQuery = trpc.mobileV1.checkout.quote.useQuery(
    {
      items: checkoutItems,
      promoCode: promoCode || null,
      fulfillmentMethod: 'pickup',
      customerEmail: customerEmail || undefined,
    },
    {
      enabled: checkoutItems.length > 0,
    },
  )

  const createOrder = trpc.mobileV1.checkout.createOrder.useMutation()

  async function handlePlaceOrder() {
    if (!customerName || !customerEmail) {
      Alert.alert('Missing fields', 'Enter customer name and email before placing the order.')
      return
    }

    if (checkoutItems.length === 0) {
      Alert.alert('Cart is empty', 'Add items before checkout.')
      return
    }

    try {
      setIsSubmitting(true)

      const created = await createOrder.mutateAsync({
        customerName,
        customerEmail,
        customerPhone: null,
        notes: null,
        items: checkoutItems,
        promoCode: promoCode || null,
        fulfillmentMethod: 'pickup',
        paymentMethod: 'pickup',
      })

      clearCart()
      if (created.guestAccessToken) {
        router.push({
          pathname: '/order-confirmation/[id]',
          params: { id: created.order.id, token: created.guestAccessToken },
        })
      } else {
        router.push({
          pathname: '/order-confirmation/[id]',
          params: { id: created.order.id },
        })
      }
    } catch (error) {
      Alert.alert('Checkout failed', error instanceof Error ? error.message : 'Unknown checkout error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const quoteRows = useMemo(() => {
    if (!quoteQuery.data) return []
    return [
      { label: 'Subtotal', value: quoteQuery.data.subtotal },
      { label: 'Discount', value: -quoteQuery.data.discountAmount },
      { label: 'Tax', value: quoteQuery.data.tax },
      { label: 'Delivery', value: quoteQuery.data.deliveryFee },
      { label: 'Total', value: quoteQuery.data.total, strong: true },
    ]
  }, [quoteQuery.data])

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.note}>Web preview supports pickup checkout flow in this build.</Text>

        <TextInput style={styles.input} placeholder="Customer name" value={customerName} onChangeText={setCustomerName} />
        <TextInput
          style={styles.input}
          placeholder="Customer email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={customerEmail}
          onChangeText={setCustomerEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Promo code"
          autoCapitalize="characters"
          value={promoCode}
          onChangeText={setPromoCode}
        />

        {quoteQuery.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#0f766e" />
            <Text style={styles.loadingText}>Calculating quote...</Text>
          </View>
        ) : null}
        {quoteQuery.error ? <Text style={styles.error}>{quoteQuery.error.message}</Text> : null}

        <FlatList
          data={quoteRows}
          keyExtractor={(row) => row.label}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, item.strong ? styles.strong : null]}>{item.label}</Text>
              <Text style={[styles.rowValue, item.strong ? styles.strong : null]}>${Number(item.value).toFixed(2)}</Text>
            </View>
          )}
        />

        <Pressable
          style={({ pressed }) => [styles.submitButton, pressed ? styles.submitButtonPressed : null]}
          onPress={handlePlaceOrder}
          disabled={isSubmitting || quoteQuery.isLoading || items.length === 0}
        >
          <Text style={styles.submitButtonText}>{isSubmitting ? 'Processing...' : 'Place Pickup Order'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f6f2' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#14532d' },
  note: { color: '#374151' },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: '#374151' },
  error: { color: '#b91c1c' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d1d5db',
    paddingVertical: 10,
  },
  rowLabel: { color: '#374151' },
  rowValue: { color: '#111827' },
  strong: { fontWeight: '700' },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonPressed: { opacity: 0.9 },
  submitButtonText: { color: '#ffffff', fontWeight: '700' },
})
