import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { BookCard } from "./BookCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBooks } from "@/hooks/useBooks";
import type { MasterBook } from "@/lib/types";
import { useContentFilter } from "@/contexts/ContentFilterContext";
import { filterBooks } from "@/hooks/useBookFilter";

export function RecommendedForYou() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { books: allBooks, trending } = useBooks();
  const { globalFilter } = useContentFilter();
  const [recommendations, setRecommendations] = useState<MasterBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState(false);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("ai-recommend", {
          body: {
            type: user ? "personalized" : "trending",
            userId: user?.id || null,
          },
        });

        if (fnError || data?.error) {
          setError(true);
          setLoading(false);
          return;
        }

        const recBooks = (data?.recommendations || []) as any[];
        if (recBooks.length > 0) {
          // Map API response to MasterBook format by matching with loaded books
          const matched = recBooks
            .map((rec: any) => allBooks.find(b => b.id === rec.id))
            .filter(Boolean) as MasterBook[];

          // If matched from allBooks, use those; otherwise create lightweight cards
          if (matched.length >= 4) {
            setRecommendations(matched);
          } else {
            // Create basic book objects from API data
            const basic: MasterBook[] = recBooks.slice(0, 10).map((r: any) => ({
              id: r.id,
              title: r.title || "",
              titleEn: r.title_en || "",
              slug: r.slug || "",
              author: { id: "", name: r.authors?.name || "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false },
              publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
              category: { id: "", name: r.categories?.name || "", nameBn: "", icon: "BookOpen", count: "0", color: "primary" },
              cover: r.cover_url || "",
              description: "",
              descriptionBn: "",
              rating: Number(r.rating) || 0,
              reviewsCount: 0,
              totalReads: "0",
              publishedDate: "",
              language: "bn",
              tags: [],
              isFeatured: r.is_featured || false,
              isNew: false,
              isBestseller: false,
              isFree: r.is_free || false,
              formats: {},
            }));
            setRecommendations(basic);
          }
        }
      } catch {
        setError(true);
      }
      setLoading(false);
    };

    // Wait for allBooks to load before fetching recommendations
    if (allBooks.length > 0) {
      fetchRecommendations();
    }
  }, [user, allBooks.length]);

  // Fallback to trending if AI fails or no results
  const displayBooks = filterBooks(
    recommendations.length > 0 ? recommendations : trending.slice(0, 8),
    globalFilter
  );

  if (displayBooks.length === 0 && !loading) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-purple-500/10">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                {user ? "Recommended " : "Popular "}
                <span className="text-purple-400">{user ? "For You" : "Books"}</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {user ? "Personalized picks based on your taste" : "Discover what readers love"}
              </p>
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

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {displayBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
