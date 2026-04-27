import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuthors } from "@/hooks/useBooks";
import { Link } from "react-router-dom";
import { BookOpen, Users, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const AuthorsPage = () => {
  const authors = useAuthors();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">All Authors</h1>
            <p className="text-sm text-muted-foreground">Browse all authors on the platform</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {authors.map((author) => (
            <Link key={author.id} to={`/author/${author.id}`} className="group text-center">
              <div className="relative w-24 h-24 md:w-28 md:h-28 mx-auto mb-3">
                <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-border/60 group-hover:ring-primary/50 transition-all duration-300">
                  <img src={author.avatar} alt={author.nameEn || author.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                </div>
                {author.isFeatured && <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] whitespace-nowrap px-2 py-0 shadow-sm">Featured</Badge>}
              </div>
              <h3 className="font-medium text-foreground text-sm group-hover:text-primary transition-colors line-clamp-1">{author.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{author.genre}</p>
              <div className="flex items-center justify-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-0.5 text-xs" title="Books"><BookOpen className="w-3 h-3" />{author.booksCount}</span>
                <span className="flex items-center gap-0.5 text-xs" title="Followers"><Users className="w-3 h-3" />{author.followers}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default AuthorsPage;
