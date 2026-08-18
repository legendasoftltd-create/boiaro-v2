import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, BookOpen, Headphones, ShoppingBag, Check } from "lucide-react"
import type { MasterBook } from "@/lib/types"

/**
 * Hard-copy specific card (price, discount badge, page count, add-to-cart) —
 * extracted from HardCopies.tsx so Best Sellers / Special Offers can reuse
 * the exact same presentation instead of re-implementing it.
 */
export function HardcopyBookCard({ book, isAdded, onAddToCart }: {
  book: MasterBook
  isAdded: boolean
  onAddToCart: (book: MasterBook, e: React.MouseEvent) => void
}) {
  const navigate = useNavigate()
  const hardcopy = book.formats.hardcopy!
  const hasEbook = book.formats.ebook?.available
  const hasAudio = book.formats.audiobook?.available

  return (
    <div className="flex-shrink-0 w-[140px] md:w-[200px] snap-start group cursor-pointer" onClick={() => navigate(`/book/${book.slug}`)}>
      <div className="relative aspect-[2/3] rounded-xl md:rounded-2xl overflow-hidden mb-2 md:mb-3 bg-card shadow-md ring-1 ring-emerald-500/15 group-hover:ring-emerald-500/40 group-hover:shadow-xl group-hover:shadow-emerald-500/[0.06] transition-all duration-300">
        <img src={book.cover} alt={book.titleEn} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {hardcopy.discount && <Badge className="bg-red-600 text-foreground text-[10px] font-bold shadow-sm">{hardcopy.discount}% OFF</Badge>}
        </div>
        {book.isBestseller && <Badge className="absolute top-8 left-2 bg-primary text-primary-foreground text-[10px] shadow-sm">Bestseller</Badge>}
        {(hasEbook || hasAudio) && (
          <div className="absolute bottom-14 left-2 flex items-center gap-1">
            {hasEbook && <Badge variant="outline" className="bg-background/70 backdrop-blur-sm border-primary/30 text-primary text-[9px] px-1.5"><BookOpen className="w-2.5 h-2.5 mr-0.5" />eBook</Badge>}
            {hasAudio && <Badge variant="outline" className="bg-background/70 backdrop-blur-sm border-blue-500/30 text-blue-400 text-[9px] px-1.5"><Headphones className="w-2.5 h-2.5 mr-0.5" />Audio</Badge>}
          </div>
        )}
        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-base font-bold text-emerald-400">৳{hardcopy.price}</span>
            {hardcopy.originalPrice && <span className="text-[11px] text-muted-foreground line-through">৳{hardcopy.originalPrice}</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">{hardcopy.pages} pages</p>
        </div>
      </div>
      <div className="space-y-0.5 px-0.5">
        <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-emerald-400 transition-colors">{book.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{book.author.name}</p>
        {book.translator?.name && <p className="text-xs text-muted-foreground line-clamp-1">Tr: {book.translator.name}</p>}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1"><Star className="w-3 h-3 fill-primary text-primary" /><span className="text-xs text-foreground font-medium">{book.rating}</span></div>
          <Button size="sm" className={`h-6 px-2.5 text-foreground text-[11px] gap-1 rounded-lg ${isAdded ? "bg-green-600 hover:bg-green-700" : "bg-emerald-600 hover:bg-emerald-700"}`} onClick={(e) => onAddToCart(book, e)}>
            {isAdded ? <><Check className="w-3 h-3" />Added</> : <><ShoppingBag className="w-3 h-3" />Add</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
