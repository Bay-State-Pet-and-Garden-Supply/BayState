import { Link } from 'expo-router'
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { useCart } from '../providers/cart-provider'

export default function CartScreen() {
  const { items, removeItem, setQuantity } = useCart()

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Your Cart</Text>

        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Your cart is empty.</Text>
            <Link href="/" asChild>
              <Pressable style={styles.cta}>
                <Text style={styles.ctaText}>Browse products</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.rowCard}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                  <View style={styles.controls}>
                    <Pressable style={styles.smallBtn} onPress={() => setQuantity(item.id, item.quantity - 1)}>
                      <Text style={styles.smallBtnText}>-</Text>
                    </Pressable>
                    <Text style={styles.qty}>{item.quantity}</Text>
                    <Pressable style={styles.smallBtn} onPress={() => setQuantity(item.id, item.quantity + 1)}>
                      <Text style={styles.smallBtnText}>+</Text>
                    </Pressable>
                    <Pressable style={styles.removeBtn} onPress={() => removeItem(item.id)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />

            <View style={styles.footer}>
              <Text style={styles.total}>Subtotal: ${subtotal.toFixed(2)}</Text>
              <Link href="/checkout" asChild>
                <Pressable style={styles.cta}>
                  <Text style={styles.ctaText}>Proceed to Checkout</Text>
                </Pressable>
              </Link>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f6f2' },
  container: { flex: 1, padding: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#14532d', marginBottom: 12 },
  emptyWrap: { gap: 12 },
  emptyText: { color: '#4b5563' },
  list: { gap: 10, paddingBottom: 16 },
  rowCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, gap: 6 },
  name: { fontWeight: '700', color: '#111827' },
  price: { color: '#14532d', fontWeight: '700' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontWeight: '700', color: '#111827' },
  qty: { minWidth: 24, textAlign: 'center', fontWeight: '700' },
  removeBtn: { marginLeft: 'auto' },
  removeText: { color: '#b91c1c', fontWeight: '600' },
  footer: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12, gap: 10 },
  total: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cta: { backgroundColor: '#0f766e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '700' },
})
