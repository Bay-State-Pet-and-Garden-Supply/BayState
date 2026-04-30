import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { trpc } from '../../lib/trpc'
import { useCart } from '../../providers/cart-provider'

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ slug: string }>()
  const slug = params.slug ?? ''

  const query = trpc.mobileV1.catalog.getProductBySlug.useQuery(
    { slug },
    { enabled: Boolean(slug) },
  )
  const { addItem } = useCart()
  const product = query.data?.product ?? null

  return (
    <SafeAreaView style={styles.safeArea}>
      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0f766e" />
        </View>
      ) : null}

      {query.error ? (
        <View style={styles.center}>
          <Text style={styles.error}>Unable to load product: {query.error.message}</Text>
        </View>
      ) : null}

      {product ? (
        <View style={styles.content}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.price}>${Number(product.price).toFixed(2)}</Text>
          <Text style={styles.stock}>Status: {product.stock_status}</Text>
          <Text style={styles.description}>{product.description || 'No description available.'}</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              addItem({
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: Number(product.price),
              })
              Alert.alert('Added to cart', product.name)
            }}
          >
            <Text style={styles.addButtonText}>Add to Cart</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    padding: 20,
    gap: 10,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f2937',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#14532d',
  },
  stock: {
    fontSize: 14,
    color: '#4b5563',
    textTransform: 'capitalize',
  },
  description: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: '#374151',
  },
  error: {
    color: '#b91c1c',
    textAlign: 'center',
  },
  addButton: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
})
