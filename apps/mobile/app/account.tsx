import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native'
import { trpc } from '../lib/trpc'
import { useAuth } from '../providers/auth-provider'

export default function AccountScreen() {
  const { session, isLoading: authLoading, signInWithPassword, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const profileQuery = trpc.mobileV1.account.me.useQuery(undefined, {
    enabled: Boolean(session?.user?.id),
  })

  const ordersQuery = trpc.mobileV1.account.listOrders.useQuery(
    { limit: 5, offset: 0 },
    { enabled: Boolean(session?.user?.id) },
  )

  const normalizedOrders = ordersQuery.data?.orders ?? []

  const profile = profileQuery.data?.profile

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color="#0f766e" />
        </View>
      </SafeAreaView>
    )
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Sign In</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed ? styles.buttonPressed : null]}
            onPress={async () => {
              try {
                await signInWithPassword({ email, password })
              } catch (error) {
                Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unknown error')
              }
            }}
          >
            <Text style={styles.actionButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.value}>User: {session.user.email}</Text>

        <Text style={styles.section}>Profile</Text>
        {profileQuery.isLoading ? <ActivityIndicator color="#0f766e" /> : null}
        {profile ? (
          <View>
            <Text style={styles.value}>Name: {profile.full_name || 'Not set'}</Text>
            <Text style={styles.value}>Phone: {profile.phone || 'Not set'}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>Recent Orders</Text>
        {normalizedOrders.map((order) => (
          <View key={order.id} style={styles.orderCard}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <Text style={styles.value}>Status: {order.status}</Text>
            <Text style={styles.value}>Total: ${Number(order.total).toFixed(2)}</Text>
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
          onPress={async () => {
            await signOut()
          }}
        >
          <Text style={styles.secondaryButtonText}>Sign Out</Text>
        </Pressable>
      </View>
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
  },
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14532d',
  },
  section: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  value: {
    color: '#374151',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButton: {
    marginTop: 8,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    borderColor: '#0f766e',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#ffffff',
    gap: 4,
  },
  orderNumber: {
    fontWeight: '700',
    color: '#111827',
  },
})
