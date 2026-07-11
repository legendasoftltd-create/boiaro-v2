import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useTranslators } from "@/hooks/useBooks";
import { Link } from "react-router-dom";
import { BookOpen, Users, Languages, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 24;

const TranslatorsPage = () => {
  const [page, setPage] = useState(0);
  const { translators, total } = useTranslators({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Languages className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">All Translators</h1>
              <p className="text-sm text-muted-foreground">Browse all {total} translators on the platform</p>
            </div>
          </div>
          {totalPages > 1 && (
            <span className="text-sm text-muted-foreground hidden sm:block">Page {page + 1} of {totalPages}</span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {translators.map((translator) => (
            <Link key={translator.id} to={`/translator/${translator.id}`} className="group text-center">
              <div className="relative w-24 h-24 md:w-28 md:h-28 mx-auto mb-3">
                <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-border/60 group-hover:ring-primary/50 transition-all duration-300">
                  <img src={translator.avatar} alt={translator.nameEn || translator.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                </div>
                {translator.isFeatured && <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] whitespace-nowrap px-2 py-0 shadow-sm">Featured</Badge>}
              </div>
              <h3 className="font-medium text-foreground text-sm group-hover:text-primary transition-colors line-clamp-1">{translator.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{translator.genre}</p>
              <div className="flex items-center justify-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-0.5 text-xs" title="Books"><BookOpen className="w-3 h-3" />{translator.booksCount}</span>
                <span className="flex items-center gap-0.5 text-xs" title="Followers"><Users className="w-3 h-3" />{translator.followers}</span>
              </div>
            </Link>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-10">
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
      <Footer />
    </main>
  );
};

export default TranslatorsPage;
