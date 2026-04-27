import { useNavigate, Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, BookOpen, Headphones, Package, Eye } from "lucide-react"
import type { MasterBook } from "@/lib/types"

interface BookCardProps {
  book: MasterBook
  showFormats?: boolean
  showPrice?: boolean
  showRating?: boolean
  /** When true, card fills its container instead of using fixed carousel width */
  fillWidth?: boolean
}

export function BookCard({ book, showFormats = true, showPrice = true, showRating = true, fillWidth = false }: BookCardProps) {
  const navigate = useNavigate()
  const hasEbook = book.formats?.ebook?.available
  const hasAudiobook = book.formats?.audiobook?.available
  const hasHardcopy = book.formats?.hardcopy?.available

  const rawLowestPrice = Math.min(
    book.formats?.ebook?.price ?? Infinity,
    book.formats?.audiobook?.price ?? Infinity,
    book.formats?.hardcopy?.price ?? Infinity
  )
  const lowestPrice = rawLowestPrice === Infinity ? 0 : rawLowestPrice
  const isFree = lowestPrice === 0 || book.isFree

  return (
     <div className={`group cursor-pointer ${fillWidth ? "w-full" : "flex-shrink-0 w-[120px] md:w-[190px] snap-start"}`} onClick={() => navigate(`/book/${book.slug}`)}>
       <div className="relative aspect-[2/3] rounded-lg md:rounded-2xl overflow-hidden mb-1.5 md:mb-3 bg-card shadow-md ring-1 ring-border/40 group-hover:ring-primary/30 group-hover:shadow-xl group-hover:shadow-primary/[0.06] transition-all duration-300">

        {book.cover && (
          <img src={book.cover} alt={book.titleEn || book.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" sizes="(max-width: 768px) 120px, 190px" />
        )}
        

        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <div className="absolute top-1.5 left-1.5 right-1.5 md:top-2 md:left-2 md:right-2 flex items-start justify-between">
          {showPrice && (
            <Badge className={`text-[10px] md:text-[11px] font-semibold shadow-sm ${isFree ? "bg-green-600 text-foreground" : "bg-primary text-primary-foreground"}`}>
              {isFree ? "Free" : `৳${lowestPrice}`}
            </Badge>
          )}
          {showFormats && (
          <div className="flex items-center gap-0.5">
              {hasEbook && <Badge variant="outline" className="bg-amber-500/20 backdrop-blur-sm border-amber-500/30 text-amber-300 text-[10px] md:text-[11px] px-1.5 md:px-2 py-0.5 gap-0.5 font-semibold"><BookOpen className="w-2.5 h-2.5 md:w-3 md:h-3" />eBook</Badge>}
              {hasAudiobook && <Badge variant="outline" className="bg-blue-500/20 backdrop-blur-sm border-blue-500/30 text-blue-300 text-[10px] md:text-[11px] px-1.5 md:px-2 py-0.5 gap-0.5 font-semibold"><Headphones className="w-2.5 h-2.5 md:w-3 md:h-3" />Audio</Badge>}
              {hasHardcopy && <Badge variant="outline" className="bg-emerald-500/20 backdrop-blur-sm border-emerald-500/30 text-emerald-300 text-[10px] md:text-[11px] px-1.5 md:px-2 py-0.5 gap-0.5 font-semibold"><Package className="w-2.5 h-2.5 md:w-3 md:h-3" />Print</Badge>}
            </div>
          )}
        </div>

        {book.isNew && <Badge className="absolute top-8 left-2 bg-red-600 text-foreground text-[10px] shadow-sm">NEW</Badge>}
        {book.isBestseller && !book.isNew && <Badge className="absolute top-8 left-2 bg-primary text-primary-foreground text-[10px] shadow-sm">Bestseller</Badge>}

        <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none">
          <Button size="sm" className="w-full btn-gold text-xs h-8 pointer-events-auto">View Details</Button>
        </div>
      </div>

      <div className="space-y-0.5 px-0.5">
        <h3 className="font-medium text-foreground line-clamp-1 text-[12px] md:text-[13px] group-hover:text-primary transition-colors">{book.title}</h3>
        {book.author.id && book.author.name && (
          <div className="flex items-center gap-1.5">
            {book.author.avatar && (
              <Link to={`/author/${book.author.id}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
                <img src={book.author.avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 ring-1 ring-border/50 hover:ring-primary transition-colors" />
              </Link>
            )}
            <Link to={`/author/${book.author.id}`} onClick={(e) => e.stopPropagation()} className="text-[11px] md:text-xs text-muted-foreground line-clamp-1 hover:text-primary transition-colors">
              {book.author.name}
            </Link>
          </div>
        )}
        {(showRating && book.rating > 0) || (Number(book.totalReads) > 0) ? (
          <div className="flex items-center justify-between pt-0.5">
            {showRating && book.rating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-primary text-primary" />
                <span className="text-xs text-foreground font-medium">{book.rating}</span>
              </div>
            )}
            {Number(book.totalReads) > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="w-3 h-3" />
                <span className="text-[11px]">{book.totalReads}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
