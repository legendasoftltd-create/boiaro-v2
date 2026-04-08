import { useState } from "react"
import { ShoppingCart, Truck, Package, Ruler, Weight, Layers, Check, Minus, Plus, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCart } from "@/contexts/CartContext"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import type { MasterBook, HardcopyFormat } from "@/lib/types"

interface Props { book: MasterBook; hardcopy: HardcopyFormat }

export function HardcopyTab({ book, hardcopy }: Props) {
  const { addToCart, openCart } = useCart()
  const navigate = useNavigate()
  const [qty, setQty] = useState(1)

  const handleAddToCart = () => {
    for (let i = 0; i < qty; i++) addToCart(book, "hardcopy", hardcopy.price)
    toast.success(`${book.title} added to cart!`)
    openCart()
  }

  const handleBuyNow = () => {
    for (let i = 0; i < qty; i++) addToCart(book, "hardcopy", hardcopy.price)
    navigate("/checkout")
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Price banner */}
      <Card className="bg-card border-emerald-500/20 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Hard Copy Price</p>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-emerald-400 font-serif">৳{hardcopy.price}</span>
                {hardcopy.originalPrice && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">৳{hardcopy.originalPrice}</span>
                    <Badge className="bg-emerald-600 text-white text-xs">-{hardcopy.discount}%</Badge>
                  </>
                )}
              </div>
              {hardcopy.originalPrice && (
                <p className="text-xs text-emerald-400 mt-1">
                  You save ৳{(hardcopy.originalPrice - hardcopy.price) * qty} on {qty} {qty > 1 ? "copies" : "copy"}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Qty selector */}
              <div className="flex items-center border border-border rounded-lg self-start">
                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setQty(Math.max(1, qty - 1))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-10 text-center text-sm font-semibold text-foreground">{qty}</span>
                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setQty(Math.min(hardcopy.stockCount || 99, qty + 1))}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button
                size="lg"
                className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold gap-2 flex-1"
                onClick={handleAddToCart}
                disabled={!hardcopy.inStock}
              >
                <ShoppingCart className="w-5 h-5" /> Add to Cart
              </Button>
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2 flex-1"
                onClick={handleBuyNow}
                disabled={!hardcopy.inStock}
              >
                <Zap className="w-5 h-5" /> Buy Now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock info */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            {hardcopy.inStock ? (
              <>
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-400">In Stock</span>
                <span className="text-xs text-muted-foreground">({hardcopy.stockCount} copies available)</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-sm font-medium text-destructive">Out of Stock</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Estimated Delivery</p>
              <p className="text-xs text-muted-foreground">Within {hardcopy.deliveryDays} business days • Free delivery</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Cash on delivery available
          </div>
        </CardContent>
      </Card>

      {/* Physical details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Layers, label: "Pages", value: hardcopy.pages.toString() },
          { icon: Package, label: "Binding", value: hardcopy.binding.charAt(0).toUpperCase() + hardcopy.binding.slice(1) },
          { icon: Weight, label: "Weight", value: hardcopy.weight },
          { icon: Ruler, label: "Dimensions", value: hardcopy.dimensions },
        ].map((item) => (
          <Card key={item.label} className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <item.icon className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
