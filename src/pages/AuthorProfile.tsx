import { useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BookCard } from "@/components/BookCard";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { trpc } from "@/lib/trpc";
import { useBooks } from "@/hooks/useBooks";
import { toMediaUrl } from "@/lib/mediaUrl";
import { stripHtml } from "@/lib/stripHtml";

const AuthorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: author, isLoading } = trpc.books.authorById.useQuery({ id: id! }, { enabled: !!id });
  const { books: allBooks, loading: booksLoading } = useBooks();

  const authorBooks = allBooks.filter((b) => b.author.id === id);

  if (isLoading || booksLoading) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>
    </main>
  );

  if (!author) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Author not found</div>
      <Footer />
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-10">
          <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-border/60 flex-shrink-0">
            <img src={toMediaUrl(author.avatar_url) || ""} alt={author.name} className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{author.name}</h1>
              {author.is_featured && <Badge className="bg-primary text-primary-foreground text-xs">Featured</Badge>}
            </div>
            {author.name_en && <p className="text-sm text-muted-foreground">{author.name_en}</p>}
            {author.genre && <p className="text-sm text-muted-foreground mt-1">{author.genre}</p>}
            {author.bio && <p className="text-sm text-muted-foreground mt-3 max-w-xl">{stripHtml(author.bio)}</p>}
            <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
              <span className="flex items-center gap-1 text-sm text-muted-foreground"><BookOpen className="w-4 h-4" />{authorBooks.length} books</span>
              <FollowButton profileId={author.id} profileType="author" />
            </div>
          </div>
        </div>
        {authorBooks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">Books by {author.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {authorBooks.map((book) => <BookCard key={book.id} book={book} />)}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
};

export default AuthorProfile;
