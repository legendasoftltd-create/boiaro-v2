import { useRef, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ChevronLeft, ChevronRight, BookOpen, Headphones, Play } from "lucide-react"
import { books } from "@/lib/data"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"

interface ProgressRow {
  book_id: string
  current_page: number | null
  total_pages: number | null
  percentage: number | null
  last_read_at: string | null
}

interface ListeningRow {
  book_id: string
  current_track: number | null
  percentage: number | null
  total_duration: number | null
  current_position: number | null
  last_listened_at: string | null
}

export function ContinueReading() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<(ProgressRow & { book: typeof books[0] })[]>([])

  const scroll = (d: "left" | "right") => scrollRef.current?.scrollBy({ left: d === "left" ? -300 : 300, behavior: "smooth" })

  useEffect(() => {
    if (!user) return
    supabase
      .from("reading_progress")
      .select("*")
      .eq("user_id", user.id)
      .order("last_read_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return
        const mapped = (data as ProgressRow[])
          .map((p) => ({ ...p, book: books.find((b) => b.id === p.book_id)! }))
          .filter((p) => p.book && (p.percentage || 0) < 100)
        setItems(mapped)
      })
  }, [user])

  if (!user && items.length === 0) {
    return (
       <section className="py-4 md:py-14">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="section-header">
            <div className="section-icon bg-primary/10"><BookOpen className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Continue <span className="text-primary">Reading</span></h2>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
            </div>
          </div>
          <div className="flex items-center justify-center h-[110px] rounded-xl bg-card/50 border border-dashed border-primary/20">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">Sign in to sync your reading progress</p>
              <Button size="sm" className="btn-gold-outline" onClick={() => navigate("/auth")}>Sign In</Button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  return (
     <section className="py-4 md:py-14">
      <div className="container mx-auto px-4 lg:px-8">
         <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10"><BookOpen className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Continue <span className="text-primary">Reading</span></h2>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-5 h-5" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row">
          {items.map((item) => (
            <div
              key={item.book_id}
              className="flex-shrink-0 w-[300px] md:w-[340px] snap-start group cursor-pointer"
              onClick={() => navigate(`/read/${item.book.slug}`)}
            >
              <div className="card-hover flex gap-4 p-4">
                <div className="relative w-20 h-28 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all">
                  <img src={item.book.cover} alt={item.book.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <Badge variant="outline" className="w-fit border-primary/50 text-primary text-xs mb-2 rounded-md"><BookOpen className="w-3 h-3 mr-1" /> eBook</Badge>
                  <h3 className="font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">{item.book.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.book.author.name}</p>
                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Page {item.current_page || 0} of {item.total_pages || item.book.formats.ebook?.pages}</span>
                      <span className="text-primary font-semibold">{Math.round(Number(item.percentage) || 0)}%</span>
                    </div>
                    <Progress value={Number(item.percentage) || 0} className="h-1.5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ContinueListening() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<(ListeningRow & { book: typeof books[0] })[]>([])

  const scroll = (d: "left" | "right") => scrollRef.current?.scrollBy({ left: d === "left" ? -340 : 340, behavior: "smooth" })

  useEffect(() => {
    if (!user) return
    supabase
      .from("listening_progress")
      .select("*")
      .eq("user_id", user.id)
      .order("last_listened_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return
        const mapped = (data as ListeningRow[])
          .map((p) => ({ ...p, book: books.find((b) => b.id === p.book_id)! }))
          .filter((p) => p.book && (Number(p.percentage) || 0) < 100)
        setItems(mapped)
      })
  }, [user])

  if (items.length === 0) return null

  return (
    <section className="py-10 md:py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-blue-500/10"><Headphones className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Continue <span className="text-blue-400">Listening</span></h2>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-5 h-5" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row">
          {items.map((item) => (
            <div
              key={item.book_id}
              className="flex-shrink-0 w-[320px] md:w-[360px] snap-start group cursor-pointer"
              onClick={() => navigate(`/book/${item.book.slug}`)}
            >
              <div className="relative flex gap-4 p-4 rounded-2xl bg-gradient-to-br from-blue-500/[0.08] via-card to-card border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-blue-500/30">
                  <img src={item.book.cover} alt={item.book.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <Badge variant="outline" className="w-fit border-blue-500/50 text-blue-400 text-xs mb-2 rounded-md"><Headphones className="w-3 h-3 mr-1" /> Audiobook</Badge>
                  <h3 className="font-medium text-foreground line-clamp-1 group-hover:text-blue-400 transition-colors">{item.book.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.book.formats.audiobook?.narrator.name}</p>
                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Track {item.current_track || 1}</span>
                      <span className="text-blue-400 font-semibold">{Math.round(Number(item.percentage) || 0)}%</span>
                    </div>
                    <Progress value={Number(item.percentage) || 0} className="h-1.5" />
                  </div>
                </div>
                <button className="absolute top-1/2 right-4 -translate-y-1/2 w-11 h-11 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 text-foreground fill-foreground ml-0.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
