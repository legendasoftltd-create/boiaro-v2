import { useParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Star, Headphones } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { trpc } from "@/lib/trpc";

const NarratorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: narrator, isLoading } = trpc.books.narratorById.useQuery({ id: id! }, { enabled: !!id });

  if (isLoading) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>
    </main>
  );

  if (!narrator) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Narrator not found</div>
      <Footer />
    </main>
  );

  const books = narrator.books || [];

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        {/* Narrator Info */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-10">
          <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-blue-500/20 flex-shrink-0">
            <img src={narrator.avatar_url || ""} alt={narrator.name} className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{narrator.name}</h1>
              {narrator.is_featured && <Badge className="bg-blue-500 text-foreground text-xs">TOP</Badge>}
            </div>
            {narrator.name_en && <p className="text-sm text-muted-foreground">{narrator.name_en}</p>}
            {narrator.specialty && <p className="text-sm text-muted-foreground mt-1">{narrator.specialty}</p>}
            {narrator.bio && <p className="text-sm text-muted-foreground mt-3 max-w-xl">{narrator.bio}</p>}
            <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
              {narrator.rating && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Star className="w-4 h-4 fill-primary text-primary" />{narrator.rating}</span>}
              <FollowButton profileId={narrator.id} profileType="narrator" />
            </div>
          </div>
        </div>

        {/* Audiobooks Section */}
        <section>
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Headphones className="w-5 h-5 text-primary" />
            অডিওবুক সমূহ
            <span className="text-sm font-normal text-muted-foreground">({books.length})</span>
          </h2>

          {books.length === 0 ? (
            <p className="text-muted-foreground text-sm">এই বর্ণনাকারীর কোনো অডিওবুক পাওয়া যায়নি।</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {books.map((book) => (
                <Link
                  key={book.id}
                  to={`/book/${book.slug}`}
                  className="group block rounded-lg overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
                >
                  <div className="aspect-[3/4] bg-muted overflow-hidden">
                    <img
                      src={book.cover_url || "/placeholder.svg"}
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
          )}
        </section>
      </div>
      <Footer />
    </main>
  );
};

export default NarratorProfile;
