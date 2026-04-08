import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, BookOpen, Star, Clock, User, Package, Headphones } from "lucide-react"
import { useBooks } from "@/hooks/useBooks"
import { useContentFilter } from "@/contexts/ContentFilterContext"

export function EditorsPick() {
  const navigate = useNavigate()
  const { editorsPick: featuredBook } = useBooks()
  const { globalFilter } = useContentFilter()

  if (!featuredBook) return null

  const hasEbook = featuredBook.formats.ebook?.available
  const hasAudiobook = featuredBook.formats.audiobook?.available
  const hasHardcopy = featuredBook.formats.hardcopy?.available

  // Hide if the book doesn't match the active filter
  if (globalFilter === "ebook" && !hasEbook) return null
  if (globalFilter === "audiobook" && !hasAudiobook) return null
  if (globalFilter === "hardcopy" && !hasHardcopy) return null

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="relative rounded-2xl md:rounded-3xl overflow-hidden bg-gradient-to-r from-card via-card to-secondary/40 ring-1 ring-border/40">
          <div className="grid md:grid-cols-2 gap-0">
             <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[440px]">
              <img src={featuredBook.cover} alt={featuredBook.title} className="w-full h-full object-cover absolute inset-0" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-card" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent md:hidden" />
              {hasAudiobook && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button className="w-16 h-16 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center hover:scale-110 hover:bg-primary transition-all duration-300 shadow-2xl shadow-primary/25">
                    <Play className="w-7 h-7 text-primary-foreground fill-primary-foreground ml-0.5" />
                  </button>
                </div>
              )}
              <div className="absolute top-4 left-4 flex items-center gap-1.5">
                {hasEbook && <Badge className="bg-primary text-primary-foreground shadow-sm text-[11px]"><BookOpen className="w-3 h-3 mr-1" /> eBook</Badge>}
                {hasAudiobook && <Badge className="bg-blue-500 text-foreground shadow-sm text-[11px]"><Headphones className="w-3 h-3 mr-1" /> Audio</Badge>}
                {hasHardcopy && <Badge className="bg-emerald-500 text-foreground shadow-sm text-[11px]"><Package className="w-3 h-3 mr-1" /> Print</Badge>}
              </div>
            </div>

             <div className="relative p-4 md:p-10 lg:p-12 flex flex-col justify-center">
               <Badge className="w-fit bg-primary/15 text-primary border-0 mb-2 md:mb-4 text-[11px]">সম্পাদকের পছন্দ</Badge>
               <h2 className="text-lg md:text-3xl lg:text-4xl font-serif font-bold text-foreground mb-2 md:mb-4 leading-tight">{featuredBook.title}</h2>
               <p className="text-xs md:text-base text-muted-foreground mb-3 md:mb-6 leading-relaxed line-clamp-2 md:line-clamp-3">{featuredBook.descriptionBn}</p>

              <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 md:mb-8">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground font-medium">{featuredBook.author.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-primary text-primary" />
                  <span className="text-sm text-foreground font-medium">{featuredBook.rating}</span>
                  <span className="text-sm text-muted-foreground">({featuredBook.reviewsCount})</span>
                </div>
                {hasAudiobook && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{featuredBook.formats.audiobook?.duration}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {hasAudiobook && <Button size="lg" className="bg-blue-500 text-foreground hover:bg-blue-600 font-semibold gap-2 rounded-xl h-11 text-[13px]" onClick={() => navigate(`/book/${featuredBook.slug}`)}><Play className="w-4 h-4 fill-current" /> Listen Now</Button>}
                {hasEbook && <Button size="lg" variant="outline" className="btn-gold-outline gap-2 h-11 text-[13px]" onClick={() => navigate(`/read/${featuredBook.slug}`)}><BookOpen className="w-4 h-4" /> Read eBook</Button>}
                {hasHardcopy && <Button size="lg" variant="outline" className="border-emerald-500/40 text-emerald-500 hover:bg-emerald-500 hover:text-foreground gap-2 rounded-xl font-semibold h-11 text-[13px] transition-all duration-200" onClick={() => navigate(`/book/${featuredBook.slug}`)}><Package className="w-4 h-4" /> Order Copy</Button>}
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/[0.03] rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
        </div>
      </div>
    </section>
  )
}
