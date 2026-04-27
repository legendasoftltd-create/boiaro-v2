import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useNarrators } from "@/hooks/useBooks";
import { Link } from "react-router-dom";
import { Headphones, Star, Mic2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const NarratorsPage = () => {
  const narrators = useNarrators();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Mic2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">All Narrators</h1>
            <p className="text-sm text-muted-foreground">Browse all narrators on the platform</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {narrators.map((narrator) => (
            <Link key={narrator.id} to={`/narrator/${narrator.id}`} className="group text-center">
              <div className="relative w-24 h-24 md:w-28 md:h-28 mx-auto mb-3">
                <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-blue-500/20 group-hover:ring-blue-500/50 transition-all duration-300">
                  <img src={narrator.avatar} alt={narrator.nameEn || narrator.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                </div>
                {narrator.isFeatured && <Badge className="absolute -top-1 -right-1 bg-blue-500 text-foreground text-[9px] px-1.5 py-0 shadow-sm">TOP</Badge>}
              </div>
              <h3 className="font-medium text-foreground text-sm group-hover:text-blue-400 transition-colors line-clamp-1">{narrator.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{narrator.specialty}</p>
              <div className="flex items-center justify-center gap-3 mt-1.5 text-xs">
                <span className="flex items-center gap-0.5 text-muted-foreground" title="Audiobooks"><Headphones className="w-3 h-3" />{narrator.audiobooksCount}</span>
                <span className="flex items-center gap-0.5 text-muted-foreground" title="Rating"><Star className="w-3 h-3 fill-primary text-primary" />{narrator.rating}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default NarratorsPage;
