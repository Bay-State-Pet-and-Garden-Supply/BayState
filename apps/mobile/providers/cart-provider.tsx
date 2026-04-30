import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'baystate-mobile-cart-v1'

export interface CartItem {
  id: string
  slug: string
  name: string
  price: number
  quantity: number
}

type CartContextValue = {
  items: CartItem[]
  isHydrated: boolean
  addItem: (input: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function upsertItem(current: CartItem[], nextItem: Omit<CartItem, 'quantity'>): CartItem[] {
  const existing = current.find((item) => item.id === nextItem.id)
  if (!existing) {
    return [...current, { ...nextItem, quantity: 1 }]
  }

  return current.map((item) =>
    item.id === nextItem.id
      ? {
          ...item,
          quantity: item.quantity + 1,
        }
      : item,
  )
}

export function CartProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return
        const parsed = JSON.parse(raw) as CartItem[]
        setItems(parsed)
      })
      .catch(() => {
        setItems([])
      })
      .finally(() => {
        setIsHydrated(true)
      })
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {
      // no-op
    })
  }, [items, isHydrated])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      isHydrated,
      addItem: (input) => {
        setItems((current) => upsertItem(current, input))
      },
      removeItem: (id) => {
        setItems((current) => current.filter((item) => item.id !== id))
      },
      setQuantity: (id, quantity) => {
        if (quantity <= 0) {
          setItems((current) => current.filter((item) => item.id !== id))
          return
        }

        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity,
                }
              : item,
          ),
        )
      },
      clearCart: () => {
        setItems([])
      },
    }),
    [items, isHydrated],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }
  return context
}
