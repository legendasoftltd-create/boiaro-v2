import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { trpc } from "@/lib/trpc";
import { toMediaUrl } from "@/lib/mediaUrl";
import { stripHtml } from "@/lib/stripHtml";

const PAGE_SIZE = 20;

const TranslatorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(0);

  const { data: translator, isLoading } = trpc.books.translatorById.useQuery(
    { id: id!, page, pageSize: PAGE_SIZE },
    { enabled: !!id, keepPreviousData: true }
  );

  if (isLoading) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>
    </main>
  );

  if (!translator) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Translator not found</div>
      <Footer />
    </main>
  );

  const books = translator.books ?? [];
  const total = translator.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-10">
          <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-border/60 flex-shrink-0">
            <img src={toMediaUrl(translator.avatar_url) || ""} alt={translator.name || ""} className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{translator.name}</h1>
              {translator.is_featured && <Badge className="bg-primary text-primary-foreground text-xs">Featured</Badge>}
            </div>
            {translator.name_en && <p className="text-sm text-muted-foreground">{translator.name_en}</p>}
            {translator.genre && <p className="text-sm text-muted-foreground mt-1">{translator.genre}</p>}
            {translator.bio && <p className="text-sm text-muted-foreground mt-3 max-w-xl">{stripHtml(translator.bio)}</p>}
            <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <BookOpen className="w-4 h-4" />{total} books
              </span>
              <FollowButton profileId={translator.id} profileType="translator" />
            </div>
          </div>
        </div>

        {total > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Books translated by {translator.name}</h2>
              {totalPages > 1 && (
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {books.map((book) => (
                <Link
                  key={book.id}
                  to={`/book/${book.slug}`}
                  className="group block rounded-lg overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
                >
                  <div className="aspect-[3/4] bg-muted overflow-hidden">
                    <img
                      src={toMediaUrl(book.cover_url) || "/placeholder.svg"}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{book.title}</h3>
                    {book.title_en && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.title_en}</p>
                    )}
                    {book.rating && book.rating > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="w-3 h-3 fill-primary text-primary" />
                        <span className="text-xs text-muted-foreground">{book.rating}</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />Previous
                </Button>
                <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={page >= totalPages - 1}
                >
                  Next<ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
};

export default TranslatorProfile;
