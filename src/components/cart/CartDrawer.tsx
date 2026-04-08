import { ShoppingBag, Minus, Plus, Trash2, ArrowRight, BookOpen, Headphones, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCart } from "@/contexts/CartContext"
import { useNavigate } from "react-router-dom"

const formatIcons = { ebook: BookOpen, audiobook: Headphones, hardcopy: Package }
const formatLabels = { ebook: "eBook", audiobook: "Audiobook", hardcopy: "Hard Copy" }

export function CartDrawer() {
  const { items, isCartOpen, closeCart, removeFromCart, updateQuantity, totalItems, totalPrice } = useCart()
  const navigate = useNavigate()

  const handleCheckout = () => {
    closeCart()
    navigate("/checkout")
  }

  return (
    <Sheet open={isCartOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent className="w-full sm:max-w-md bg-background/95 backdrop-blur-xl border-border/40 flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2.5 text-foreground font-serif text-lg">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Cart ({totalItems})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Your cart is empty</p>
            <Button variant="outline" onClick={closeCart} className="rounded-xl">Continue Browsing</Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-3 py-4">
                {items.map((item) => {
                  const Icon = formatIcons[item.format]
                  return (
                    <div key={`${item.book.id}-${item.format}`} className="flex gap-3 p-3 rounded-2xl bg-card/80 border border-border/50 transition-all hover:border-border">
                      <img src={item.book.cover} alt="" className="w-16 h-20 rounded-xl object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.book.title}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.book.author.name}</p>
                        <Badge variant="outline" className="mt-1.5 text-[10px] gap-1 rounded-md">
                          <Icon className="w-2.5 h-2.5" /> {formatLabels[item.format]}
                        </Badge>
                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center border border-border/60 rounded-lg overflow-hidden">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => updateQuantity(item.book.id, item.format, item.quantity - 1)}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-7 text-center text-xs font-semibold text-foreground">{item.quantity}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => updateQuantity(item.book.id, item.format, item.quantity + 1)}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">৳{item.price * item.quantity}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.book.id, item.format)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            <div className="border-t border-border/40 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal ({totalItems} items)</span>
                <span className="text-xl font-bold text-foreground font-serif">৳{totalPrice}</span>
              </div>
              <Button className="w-full btn-gold gap-2 h-12 text-sm" onClick={handleCheckout}>
                Proceed to Checkout <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
