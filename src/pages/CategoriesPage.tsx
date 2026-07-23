import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useCategories } from "@/hooks/useBooks";
import { Link } from "react-router-dom";
import { Grid, BookOpen, Search } from "lucide-react";
import { toMediaUrl } from "@/lib/mediaUrl";
import { iconMap } from "@/lib/categoryIcons";
import { Input } from "@/components/ui/input";

function CategoryIcon({ icon }: { icon: string }) {
  const isUrl = icon.startsWith("/") || icon.startsWith("http");
  if (isUrl) {
    return <img src={toMediaUrl(icon)} alt="" className="w-8 h-8 object-contain" />;
  }
  const Icon = iconMap[icon] || BookOpen;
  return <Icon className="w-6 h-6 text-primary" />;
}

const CategoriesPage = () => {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const categories = useCategories(search);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Grid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">All Categories</h1>
            <p className="text-sm text-muted-foreground">Browse all {categories.length} categories on the platform</p>
          </div>
        </div>
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search categories by name..."
            className="pl-9 h-10 bg-card border-border/60"
          />
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No categories match this search.</p>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {categories.map((category) => (
            <Link key={category.id} to={`/books?category=${category.id}`} className="group">
              <div className={`relative p-4 rounded-xl md:rounded-2xl bg-gradient-to-br ${category.color || "from-primary/10 to-primary/5"} border border-border/40 hover:border-primary/30 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/[0.04]`}>
                <div className="w-11 h-11 rounded-xl bg-background/40 flex items-center justify-center mb-3 mx-auto">
                  <CategoryIcon icon={category.icon} />
                </div>
                <h3 className="font-medium text-foreground text-sm text-center mb-0.5 group-hover:text-primary transition-colors line-clamp-1">{category.nameBn}</h3>
                <p className="text-xs text-muted-foreground text-center">{category.count} বই</p>
              </div>
            </Link>
          ))}
        </div>
        )}
      </div>
      <Footer />
    </main>
  );
};

export default CategoriesPage;
