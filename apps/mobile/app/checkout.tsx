import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { useStripe } from '@stripe/stripe-react-native'
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native'
import { trpc } from '../lib/trpc'
import { useAuth } from '../providers/auth-provider'
import { useCart } from '../providers/cart-provider'

export default function CheckoutScreen() {
  const router = useRouter()
  const { session } = useAuth()
  const { items, clearCart } = useCart()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()

  const [promoCode, setPromoCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState(session?.user.email || '')
  const [paymentMethod, setPaymentMethod] = useState<'pickup' | 'credit_card'>('pickup')
  const [isPaying, setIsPaying] = useState(false)

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
  const createPaymentSheet = trpc.mobileV1.checkout.createPaymentSheet.useMutation()
  const completePayment = trpc.mobileV1.checkout.completePayment.useMutation()

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
      setIsPaying(true)

      const created = await createOrder.mutateAsync({
        customerName,
        customerEmail,
        customerPhone: null,
        notes: null,
        items: checkoutItems,
        promoCode: promoCode || null,
        fulfillmentMethod: 'pickup',
        paymentMethod,
      })

      if (paymentMethod === 'pickup') {
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
        return
      }

      const paymentSheet = await createPaymentSheet.mutateAsync({
        orderId: created.order.id,
        customerEmail,
        customerName,
      })

      const initResult = await initPaymentSheet({
        customerId: paymentSheet.customerId,
        customerEphemeralKeySecret: paymentSheet.ephemeralKeySecret,
        paymentIntentClientSecret: paymentSheet.paymentIntentClientSecret,
        merchantDisplayName: 'Bay State Pet & Garden Supply',
        returnURL: 'baystate://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      })

      if (initResult.error) {
        throw new Error(initResult.error.message)
      }

      const presentResult = await presentPaymentSheet()
      if (presentResult.error) {
        throw new Error(presentResult.error.message)
      }

      await completePayment.mutateAsync({
        orderId: created.order.id,
        paymentIntentId: paymentSheet.paymentIntentId,
        paymentMethod: 'credit_card',
        customerEmail,
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
      setIsPaying(false)
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

        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleBtn, paymentMethod === 'pickup' ? styles.toggleBtnActive : null]}
            onPress={() => setPaymentMethod('pickup')}
          >
            <Text style={[styles.toggleText, paymentMethod === 'pickup' ? styles.toggleTextActive : null]}>Pay at Pickup</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, paymentMethod === 'credit_card' ? styles.toggleBtnActive : null]}
            onPress={() => setPaymentMethod('credit_card')}
          >
            <Text style={[styles.toggleText, paymentMethod === 'credit_card' ? styles.toggleTextActive : null]}>Credit Card</Text>
          </Pressable>
        </View>

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
          disabled={isPaying || quoteQuery.isLoading || items.length === 0}
        >
          <Text style={styles.submitButtonText}>
            {isPaying ? 'Processing...' : paymentMethod === 'credit_card' ? 'Pay with Card' : 'Place Pickup Order'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f6f2' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#14532d' },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  toggleText: { color: '#374151', fontWeight: '600' },
  toggleTextActive: { color: '#14532d' },
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
