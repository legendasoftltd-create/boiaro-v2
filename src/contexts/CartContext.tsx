import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { MasterBook, BookFormat } from "@/lib/types"

export interface CartItem {
  book: MasterBook
  format: BookFormat
  quantity: number
  price: number
}

interface CartContextType {
  items: CartItem[]
  isCartOpen: boolean
  addToCart: (book: MasterBook, format: BookFormat, price: number, qty?: number) => void
  removeFromCart: (bookId: string, format: BookFormat) => void
  updateQuantity: (bookId: string, format: BookFormat, quantity: number) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
  totalItems: number
  totalPrice: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const CART_STORAGE_KEY = "boiaro_cart"

function loadStoredCart(): CartItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadStoredCart)
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // localStorage unavailable (private browsing, quota, etc.) — cart just won't persist
    }
  }, [items])

  const addToCart = (book: MasterBook, format: BookFormat, price: number, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.book.id === book.id && i.format === format)
      if (existing) {
        return prev.map((i) =>
          i.book.id === book.id && i.format === format
            ? { ...i, quantity: i.quantity + qty }
            : i
        )
      }
      return [...prev, { book, format, quantity: qty, price }]
    })
  }

  const removeFromCart = (bookId: string, format: BookFormat) => {
    setItems((prev) => prev.filter((i) => !(i.book.id === bookId && i.format === format)))
  }

  const updateQuantity = (bookId: string, format: BookFormat, quantity: number) => {
    if (quantity <= 0) return removeFromCart(bookId, format)
    setItems((prev) =>
      prev.map((i) =>
        i.book.id === bookId && i.format === format ? { ...i, quantity } : i
      )
    )
  }

  const clearCart = () => setItems([])
  const openCart = () => setIsCartOpen(true)
  const closeCart = () => setIsCartOpen(false)

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, isCartOpen, addToCart, removeFromCart, updateQuantity, clearCart, openCart, closeCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
