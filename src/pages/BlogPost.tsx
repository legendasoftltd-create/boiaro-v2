import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !post ? (
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-foreground">আর্টিকেল পাওয়া যায়নি</h1>
          </div>
        ) : (
          <>
            <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
              <ArrowLeft className="h-4 w-4" />ব্লগে ফিরুন
            </Link>
            {post.cover_image && (
              <img src={post.cover_image} alt={post.title} className="w-full rounded-xl mb-8 object-cover max-h-96" />
            )}
            <div className="flex gap-2 mb-4">
              {post.category && <Badge variant="secondary">{post.category}</Badge>}
              {(post.tags as string[] | null)?.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
            </div>
            <h1 className="text-3xl font-bold font-serif text-foreground mb-4">{post.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
              {post.author_name && <span className="flex items-center gap-1"><User className="h-4 w-4" />{post.author_name}</span>}
              {post.publish_date && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(post.publish_date).toLocaleDateString("bn-BD")}</span>}
            </div>
            <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
