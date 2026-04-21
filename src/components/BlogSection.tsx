import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Newspaper, Calendar } from "lucide-react"
import { useRef } from "react"
import { format } from "date-fns"

export function BlogSection() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["blog-posts-homepage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, cover_image, publish_date, category, author_name")
        .eq("status", "published")
        .order("publish_date", { ascending: false })
        .limit(8)
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" })
  }

  // if (isLoading || posts.length === 0) return null

  if (isLoading) return <p>Loading...</p>

  if (!posts || posts.length === 0) {
    return <p>No posts found</p>
  }

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10">
              <Newspaper className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                ব্লগ ও <span className="text-primary">আর্টিকেল</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">আমাদের সাম্প্রতিক লেখা</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="scroll-row stagger-children">
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="min-w-[260px] max-w-[280px] rounded-xl overflow-hidden bg-card border border-border/40 hover:border-primary/30 transition-all group"
            >
              {post.cover_image && (
                <div className="aspect-[16/9] overflow-hidden">
                  <img
                    src={post.cover_image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}
              <div className="p-3">
                {post.category && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">{post.category}</span>
                )}
                <h3 className="text-sm font-semibold text-foreground line-clamp-2 mt-1 group-hover:text-primary transition-colors">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{post.excerpt}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                  {post.publish_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(post.publish_date), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-4 md:mt-8">
          <Link to="/blog">
            <Button variant="outline" className="btn-gold-outline h-9 md:h-10 px-5 md:px-6 text-[12px] md:text-[13px]">
              View All Posts
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
