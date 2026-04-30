import { Stack } from 'expo-router'
import { StripeProvider } from '@stripe/stripe-react-native'
import { AppProvider } from '../providers/app-provider'
import { AuthProvider } from '../providers/auth-provider'
import { CartProvider } from '../providers/cart-provider'

const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={stripeKey}>
      <AuthProvider>
        <AppProvider>
          <CartProvider>
            <Stack
              screenOptions={{
                headerTintColor: '#1f2937',
                headerTitleStyle: {
                  fontWeight: '700',
                },
              }}
            />
          </CartProvider>
        </AppProvider>
      </AuthProvider>
    </StripeProvider>
  )
}
