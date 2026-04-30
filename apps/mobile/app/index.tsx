import { Link } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { trpc } from '../lib/trpc'
import { useCart } from '../providers/cart-provider'

export default function HomeScreen() {
  const productsQuery = trpc.mobileV1.catalog.listProducts.useQuery({ limit: 20, offset: 0 })
  const { items } = useCart()

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>BayState Mobile</Text>
        <Text style={styles.subtitle}>Catalog MVP powered by tRPC</Text>
        <Link href="/cart" asChild>
          <Pressable style={styles.cartPill}>
            <Text style={styles.cartPillText}>Cart ({items.reduce((sum, item) => sum + item.quantity, 0)})</Text>
          </Pressable>
        </Link>
      </View>

      {productsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      ) : null}

      {productsQuery.error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Could not load products</Text>
          <Text style={styles.errorText}>{productsQuery.error.message}</Text>
        </View>
      ) : null}

      {productsQuery.data ? (
        <FlatList
          data={productsQuery.data.products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/product/[slug]', params: { slug: item.slug } }} asChild>
              <Pressable style={styles.card}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productMeta}>{item.stock_status}</Text>
                <Text style={styles.productPrice}>${Number(item.price).toFixed(2)}</Text>
              </Pressable>
            </Link>
          )}
          ListFooterComponent={
            <View style={styles.footerLinks}>
              <Link href="/checkout" asChild>
                <Pressable style={styles.linkButton}>
                  <Text style={styles.linkButtonText}>Open Checkout MVP</Text>
                </Pressable>
              </Link>
              <Link href="/account" asChild>
                <Pressable style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Account + Orders</Text>
                </Pressable>
              </Link>
            </View>
          }
        />
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#14532d',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#4b5563',
  },
  cartPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#14532d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cartPillText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7f1d1d',
  },
  errorText: {
    marginTop: 8,
    color: '#b91c1c',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  productMeta: {
    marginTop: 4,
    textTransform: 'capitalize',
    color: '#6b7280',
  },
  productPrice: {
    marginTop: 10,
    fontSize: 16,
    color: '#14532d',
    fontWeight: '700',
  },
  footerLinks: {
    marginTop: 16,
    gap: 12,
  },
  linkButton: {
    borderRadius: 12,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f766e',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '700',
  },
})
