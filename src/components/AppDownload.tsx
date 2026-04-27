import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, BookOpen, Headphones, Play } from "lucide-react"
import { useSiteSettings } from "@/hooks/useSiteSettings"

export function AppDownload() {
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")
  const appStoreUrl = get("app_ios_url") || get("app_store_url")
  const playStoreUrl = get("app_android_url") || get("google_play_url")
  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-card via-card to-secondary/30 border border-border/40">
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />

          <div className="relative grid lg:grid-cols-2 gap-6 md:gap-8 items-center p-5 md:p-10 lg:p-14">
            <div className="order-2 lg:order-1">
              <Badge className="bg-primary/15 text-primary border-0 mb-4 text-[11px] font-medium">Download Now</Badge>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-bold text-foreground mb-4 leading-tight">
                Your Library, <br /><span className="text-primary">Always With You</span>
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-5 md:mb-8 max-w-lg">
                Download the {brandName} app and carry your entire Bengali library in your pocket. Read offline, sync across devices, and enjoy premium audiobooks.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-5 md:mb-8">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                  <span className="text-[13px] text-foreground font-medium">Offline Reading</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Headphones className="w-4 h-4 text-primary" /></div>
                  <span className="text-[13px] text-foreground font-medium">Premium Audio</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 mb-6">
                <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 h-13 px-5 rounded-xl" asChild>
                  <a href={appStoreUrl || "#"} target="_blank" rel="noopener noreferrer">
                    <svg className="w-6 h-6 mr-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    <div className="text-left"><div className="text-[10px] opacity-70">Download on the</div><div className="text-[13px] font-semibold">App Store</div></div>
                  </a>
                </Button>
                <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 h-13 px-5 rounded-xl" asChild>
                  <a href={playStoreUrl || "#"} target="_blank" rel="noopener noreferrer">
                    <svg className="w-6 h-6 mr-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/></svg>
                    <div className="text-left"><div className="text-[10px] opacity-70">Get it on</div><div className="text-[13px] font-semibold">Google Play</div></div>
                  </a>
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">{[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-primary text-primary" />)}</div>
                <span className="text-[13px] text-muted-foreground"><span className="text-foreground font-medium">4.8</span> from 50K+ reviews</span>
              </div>
            </div>

            <div className="relative flex justify-center order-1 lg:order-2">
              <div className="relative w-[240px] md:w-[270px]">
                <div className="relative bg-card rounded-[36px] p-2.5 shadow-2xl shadow-black/40 border border-border/50 glow-gold">
                  <div className="relative bg-background rounded-[28px] overflow-hidden aspect-[9/19]">
                    <div className="absolute top-0 left-0 right-0 h-7 bg-background z-10 flex items-center justify-between px-5">
                      <span className="text-[10px] text-foreground font-medium">9:41</span>
                    </div>
                    <div className="pt-9 px-3 pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-primary font-serif font-bold text-base">{brandName}</span>
                        <div className="w-7 h-7 rounded-full bg-secondary" />
                      </div>
                      <div className="relative rounded-xl overflow-hidden mb-3">
                        <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=180&fit=crop" alt="Featured" className="w-full h-28 object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2">
                          <Badge className="bg-primary text-primary-foreground text-[9px] mb-1">Trending</Badge>
                          <p className="text-[11px] font-medium text-foreground">পথের পাঁচালী</p>
                        </div>
                        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary/90 flex items-center justify-center">
                          <Play className="w-3 h-3 text-primary-foreground fill-primary-foreground ml-0.5" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {["https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=100&h=150&fit=crop", "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=100&h=150&fit=crop", "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=100&h=150&fit=crop"].map((src, i) => (
                          <div key={i} className="aspect-[2/3] rounded-lg overflow-hidden">
                            <img src={src} alt={`Book ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 bg-secondary rounded-xl p-2 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center"><Headphones className="w-3.5 h-3.5 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">চোখের বালি</p>
                          <div className="w-full h-0.5 bg-muted rounded-full mt-1"><div className="w-2/3 h-full bg-primary rounded-full" /></div>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"><Play className="w-3 h-3 text-primary-foreground fill-primary-foreground ml-0.5" /></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/[0.08] rounded-full blur-3xl" />
                <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-primary/[0.08] rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
