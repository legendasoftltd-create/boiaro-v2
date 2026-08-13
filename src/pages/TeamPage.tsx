import { trpc } from "@/lib/trpc";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Facebook, Linkedin, Twitter, User } from "lucide-react";

export default function TeamPage() {
  const { data: members = [], isLoading } = trpc.books.teamMembers.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">BoiAro টিম ও ম্যানেজমেন্ট</h1>
        <p className="text-muted-foreground mb-8">যারা BoiAro-কে গড়ে তুলছেন</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">টিমের তথ্য শীঘ্রই যোগ করা হবে</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {members.map((m: any) => (
              <div key={m.id} className="rounded-xl border border-border/40 bg-card/60 p-6 text-center">
                <div className="w-24 h-24 rounded-full bg-secondary mx-auto mb-4 overflow-hidden flex items-center justify-center">
                  {m.photo_url ? (
                    <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-muted-foreground" />
                  )}
                </div>
                <h2 className="font-bold font-serif text-foreground">{m.name}</h2>
                <p className="text-sm text-primary mb-2">{m.role_title}</p>
                {m.bio && <p className="text-sm text-muted-foreground leading-relaxed mb-3">{m.bio}</p>}
                {(m.facebook_url || m.linkedin_url || m.twitter_url) && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {m.facebook_url && (
                      <a href={m.facebook_url} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                        className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                        <Facebook className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {m.linkedin_url && (
                      <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                        className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                        <Linkedin className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {m.twitter_url && (
                      <a href={m.twitter_url} target="_blank" rel="noopener noreferrer" aria-label="Twitter"
                        className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                        <Twitter className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
