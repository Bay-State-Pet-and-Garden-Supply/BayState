import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { trpc } from '../../lib/trpc'
import { useAuth } from '../../providers/auth-provider'

export default function OrderConfirmationScreen() {
  const params = useLocalSearchParams<{ id: string; token?: string }>()
  const { session } = useAuth()

  const orderId = params.id ?? ''
  const token = params.token

  const myOrderQuery = trpc.mobileV1.checkout.myOrder.useQuery(
    { orderId },
    { enabled: Boolean(orderId && session?.user && !token) },
  )

  const guestOrderQuery = trpc.mobileV1.checkout.getGuestOrder.useQuery(
    { orderId, token: token || '' },
    { enabled: Boolean(orderId && token) },
  )

  const order = myOrderQuery.data?.order ?? guestOrderQuery.data?.order
  const isLoading = myOrderQuery.isLoading || guestOrderQuery.isLoading
  const error = myOrderQuery.error ?? guestOrderQuery.error

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Order Confirmation</Text>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0f766e" />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error.message}</Text> : null}

        {order ? (
          <View style={styles.card}>
            <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
            <Text style={styles.value}>Status: {order.status}</Text>
            <Text style={styles.value}>Payment: {order.payment_status}</Text>
            <Text style={styles.value}>Total: ${Number(order.total).toFixed(2)}</Text>
            <Text style={styles.value}>Email: {order.customer_email}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f6f2' },
  container: { flex: 1, padding: 20, gap: 12 },
  center: { paddingVertical: 20, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#14532d' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 14, gap: 6 },
  orderNumber: { fontSize: 18, fontWeight: '700', color: '#111827' },
  value: { color: '#374151' },
  error: { color: '#b91c1c' },
})
