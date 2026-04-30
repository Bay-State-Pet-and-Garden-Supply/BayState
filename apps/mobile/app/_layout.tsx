import { Stack } from 'expo-router'
import { AppProvider } from '../providers/app-provider'
import { AuthProvider } from '../providers/auth-provider'
import { CartProvider } from '../providers/cart-provider'

export default function RootLayout() {
  return (
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
  )
}
