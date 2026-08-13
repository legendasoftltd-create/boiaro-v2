import { trpc } from "@/lib/trpc";
import { Link, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Calendar, User } from "lucide-react";

// Reuses the blog/article system for the About section's "News & Media",
// "Events", and "Awards & Recognition" pages — admin tags a post with the
// matching category and it shows up here, filtered.
const CATEGORY_LABELS: Record<string, { title: string; subtitle: string; empty: string }> = {
  news: { title: "সংবাদ ও মিডিয়া", subtitle: "BoiAro সম্পর্কে সাম্প্রতিক সংবাদ ও মিডিয়া কভারেজ", empty: "এখনো কোনো সংবাদ প্রকাশিত হয়নি" },
  event: { title: "ইভেন্ট", subtitle: "আমাদের আসন্ন ও অতীত ইভেন্টসমূহ", empty: "এখনো কোনো ইভেন্ট প্রকাশিত হয়নি" },
  award: { title: "পুরস্কার ও স্বীকৃতি", subtitle: "BoiAro-এর অর্জিত পুরস্কার ও স্বীকৃতি", empty: "এখনো কোনো পুরস্কার যোগ করা হয়নি" },
};

export default function BlogList() {
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") || undefined;
  const { data: result, isLoading } = trpc.books.blogPosts.useQuery({ limit: 50, category });
  const posts = result?.posts ?? [];
  const labels = category ? CATEGORY_LABELS[category] : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">{labels?.title ?? "ব্লগ"}</h1>
        <p className="text-muted-foreground mb-8">{labels?.subtitle ?? "আমাদের সাম্প্রতিক লেখা ও আর্টিকেল"}</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">{labels?.empty ?? "কোনো আর্টিকেল প্রকাশিত হয়নি"}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(post => (
              <Link key={post.id} to={`/blog/${post.slug}`} className="group">
                <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden hover:border-primary/40 transition-colors">
                  {post.cover_image && (
                    <img src={post.cover_image} alt={post.title} className="w-full h-48 object-cover" />
                  )}
                  <div className="p-5 space-y-3">
                    <div className="flex gap-2">
                      {post.category && <Badge variant="secondary">{post.category}</Badge>}
                      {post.is_featured && <Badge className="bg-primary/20 text-primary">ফিচার্ড</Badge>}
                    </div>
                    <h2 className="text-lg font-bold font-serif text-foreground group-hover:text-primary transition-colors line-clamp-2">{post.title}</h2>
                    {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {post.author_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{post.author_name}</span>}
                      {post.publish_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(post.publish_date).toLocaleDateString("bn-BD")}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
