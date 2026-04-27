import { useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BookCard } from "@/components/BookCard";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { trpc } from "@/lib/trpc";
import { useBooks } from "@/hooks/useBooks";

const PublisherProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: publisher, isLoading } = trpc.books.publisherById.useQuery({ id: id! }, { enabled: !!id });
  const { books: allBooks, loading: booksLoading } = useBooks();

  const publisherBooks = allBooks.filter((b) => b.publisher.id === id);

  if (isLoading || booksLoading) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>
    </main>
  );

  if (!publisher) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Publisher not found</div>
      <Footer />
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-10">
          <div className="relative w-32 h-32 rounded-xl overflow-hidden ring-2 ring-border/60 flex-shrink-0 bg-muted">
            <img src={publisher.logo_url || ""} alt={publisher.name} className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{publisher.name}</h1>
              {publisher.is_verified && (
                <Badge className="bg-emerald-600 text-foreground text-xs gap-1">
                  <CheckCircle className="w-3 h-3" /> Verified
                </Badge>
              )}
              {publisher.is_featured && <Badge className="bg-primary text-primary-foreground text-xs">Featured</Badge>}
            </div>
            {publisher.name_en && <p className="text-sm text-muted-foreground">{publisher.name_en}</p>}
            {publisher.description && <p className="text-sm text-muted-foreground mt-3 max-w-xl">{publisher.description}</p>}
            <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <BookOpen className="w-4 h-4" />{publisherBooks.length} books
              </span>
              <FollowButton profileId={publisher.id} profileType="publisher" />
            </div>
          </div>
        </div>
        {publisherBooks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-foreground">Books by {publisher.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {publisherBooks.map((book) => <BookCard key={book.id} book={book} fillWidth />)}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
};

export default PublisherProfile;
