import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CalendarDays } from "lucide-react";

export default function CmsPage() {
  const { slug } = useParams<{ slug: string }>();

  // Scroll to top on slug change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [slug]);

  const { data: page, isLoading } = useQuery({
    queryKey: ["cms-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("*")
        .eq("slug", slug!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-10 sm:pb-16">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !page ? (
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
            <p className="text-muted-foreground mt-2">The page you're looking for doesn't exist or has been removed.</p>
          </div>
        ) : (
          <article>
            {page.seo_title && <title>{page.seo_title}</title>}

            {/* Header */}
            <header className="mb-8 sm:mb-12 border-b border-border/40 pb-6 sm:pb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-serif text-foreground leading-tight">
                {page.title}
              </h1>
              <div className="flex items-center gap-2 mt-4 text-muted-foreground text-sm">
                <CalendarDays className="h-4 w-4" />
                <span>Last updated: {formatDate(page.updated_at)}</span>
              </div>
            </header>

            {/* Featured image */}
            {page.featured_image && (
              <img
                src={page.featured_image}
                alt={page.title}
                className="w-full rounded-xl mb-8 sm:mb-12 object-cover max-h-72"
              />
            )}

            {/* Content */}
            <div
              className="cms-content prose prose-invert max-w-none
                prose-headings:font-serif prose-headings:text-foreground prose-headings:font-semibold
                prose-h2:text-xl prose-h2:sm:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-border/30 prose-h2:pb-2
                prose-h3:text-lg prose-h3:sm:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-[15px] prose-p:sm:text-base prose-p:mb-4
                prose-li:text-muted-foreground prose-li:text-[15px] prose-li:sm:text-base prose-li:leading-relaxed
                prose-ul:my-4 prose-ul:space-y-1
                prose-ol:my-4 prose-ol:space-y-1
                prose-strong:text-foreground prose-strong:font-semibold
                prose-a:text-primary prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-primary/80
                prose-blockquote:border-l-primary/40 prose-blockquote:bg-card/60 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4
              "
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </article>
        )}
      </main>
      <Footer />
    </div>
  );
}
