import { useState } from "react"
import { useLocation } from "react-router-dom"
import { Menu, X, Search, User, ShoppingBag, BookOpen, Headphones, Package, Layers, Radio } from "lucide-react"
import { useContentFilter, type ContentType } from "@/contexts/ContentFilterContext"
import logoBoiaroFallback from "@/assets/logo_boiaro.png"
import logoBoiaroShortFallback from "@/assets/logo_boiaro_short.png"
import { Button } from "@/components/ui/button"

import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/contexts/CartContext"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationBell } from "@/components/NotificationBell"
import { SmartSearch } from "@/components/SmartSearch"
import { useRadioStation } from "@/hooks/useRadioStation"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { useTheme } from "next-themes"
import { toMediaUrl } from "@/lib/mediaUrl"

const navLinks = [
  { href: "/books?format=ebook", label: "eBooks", icon: BookOpen },
  { href: "/books?format=audiobook", label: "Audiobooks", icon: Headphones },
  { href: "/books?format=hardcopy", label: "Hard Copy", icon: Package },
  { href: "/books", label: "Categories" },
]

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { globalFilter, setGlobalFilter } = useContentFilter()
  const { user, profile } = useAuth()
  const { totalItems, openCart } = useCart()
  const { data: radioStation } = useRadioStation()
  const { book: activeBook, isPlaying: radioPlaying } = useAudioPlayer()
  const { get } = useSiteSettings()
  const { resolvedTheme } = useTheme()
  const isRadioLive = radioStation && activeBook?.id === `radio-${radioStation.id}` && radioPlaying
  const navigate = useNavigate()
  const location = useLocation()
  const isHomepage = location.pathname === "/"
  const initials = (profile?.display_name || user?.email || "U").slice(0, 2).toUpperCase()

  // Dynamic logos from site settings, falling back to static assets
  const logoDesktop = toMediaUrl(get("logo_url")) || logoBoiaroFallback
  const logoMobile = toMediaUrl(get("logo_mobile_url")) || logoBoiaroShortFallback
  const logoDark = toMediaUrl(get("logo_dark_url"))
  const brandName = get("brand_name", "BoiAro")

  // Use dark mode logo when in dark theme and available
  const effectiveDesktopLogo = resolvedTheme === "dark" && logoDark ? logoDark : logoDesktop
  const effectiveMobileLogo = resolvedTheme === "dark" && logoDark ? logoDark : logoMobile

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 md:bg-background/60 md:backdrop-blur-2xl border-b border-border/30">
        <nav className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="/" className="flex items-center gap-2 group">
              <img src={effectiveDesktopLogo} alt={brandName} className="h-9 w-auto hidden md:block" />
              <img src={effectiveMobileLogo} alt={brandName} className="h-9 w-auto md:hidden" />
            </a>

            <div className="hidden lg:flex items-center gap-0.5">
              {navLinks.map((link) => (
                <button key={link.href} onClick={() => navigate(link.href)} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3.5 py-2 rounded-lg hover:bg-secondary/50">
                  {link.icon && <link.icon className="w-3.5 h-3.5" />}
                  {link.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {radioStation && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`relative rounded-full h-9 w-9 ${isRadioLive ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    const el = document.querySelector("[data-section='live_radio']")
                    if (el) el.scrollIntoView({ behavior: "smooth" })
                    else navigate("/#live_radio")
                  }}
                >
                  <Radio className="w-[18px] h-[18px]" />
                  {isRadioLive && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full animate-pulse ring-2 ring-background" />
                  )}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full h-9 w-9" onClick={() => setSearchOpen(true)}>
                <Search className="w-[18px] h-[18px]" />
              </Button>
              <NotificationBell />
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground rounded-full h-9 w-9" onClick={openCart}>
                <ShoppingBag className="w-[18px] h-[18px]" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ring-2 ring-background">{totalItems}</span>
                )}
              </Button>

              {user ? (
                <button onClick={() => navigate("/profile")} className="hidden md:flex ml-1">
                  <Avatar className="w-8 h-8 border-2 border-primary/20 hover:border-primary/50 transition-colors">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-serif font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <Button variant="ghost" size="icon" className="hidden md:flex text-muted-foreground hover:text-foreground rounded-full h-9 w-9" onClick={() => navigate("/auth")}>
                  <User className="w-[18px] h-[18px]" />
                </Button>
              )}

              <div className="hidden md:flex items-center ml-1.5">
                <Button className="btn-gold px-4 h-9 text-[13px] gap-2">Download App</Button>
              </div>
              <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden p-2 text-foreground rounded-lg hover:bg-secondary/50 transition-colors ml-0.5" aria-label="Toggle menu">
                {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {isOpen && (
            <div className="lg:hidden py-3 border-t border-border/30 animate-fade-in-up">
              <div className="flex flex-col gap-0.5">
                {navLinks.map((link) => (
                  <button key={link.href} onClick={() => { setIsOpen(false); navigate(link.href) }} className="flex items-center gap-3 text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors py-3 px-3 rounded-xl hover:bg-secondary/50">
                    {link.icon && <link.icon className="w-5 h-5" />}
                    {link.label}
                  </button>
                ))}
                {user ? (
                  <Button onClick={() => { setIsOpen(false); navigate("/profile") }} variant="outline" className="mt-2 w-full gap-2 h-11 rounded-xl">
                    <User className="w-4 h-4" /> My Profile
                  </Button>
                ) : (
                  <Button onClick={() => { setIsOpen(false); navigate("/auth") }} variant="outline" className="mt-2 w-full gap-2 h-11 rounded-xl">
                    <User className="w-4 h-4" /> Sign In
                  </Button>
                )}
                <Button className="btn-gold mt-2 w-full h-11">Download App</Button>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Mobile filter tabs – sticky below navbar, homepage only */}
      {isHomepage && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-background/[0.97] border-b border-border/30 lg:hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none">
            {([
              { key: "all" as ContentType, label: "All", icon: Layers },
              { key: "ebook" as ContentType, label: "eBook", icon: BookOpen },
              { key: "audiobook" as ContentType, label: "Audiobook", icon: Headphones },
              { key: "hardcopy" as ContentType, label: "Hardcopy", icon: Package },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setGlobalFilter(key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  globalFilter === key
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-primary/50 scale-[1.02]"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground border border-border/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <SmartSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
