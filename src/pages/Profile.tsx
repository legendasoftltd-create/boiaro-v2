import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  BookOpen, Headphones, ShoppingBag, Bookmark, Settings, LogOut,
  Play, Eye, Trash2, BookCopy, Clock,
} from "lucide-react"
import { useNavigate, Link } from "react-router-dom"
import { useToast } from "@/hooks/use-toast"

interface LibraryItem {
  book_id: string
  percentage: number
  current_page?: number
  total_pages?: number
  current_track?: number
  last_read_at?: string
  last_listened_at?: string
  books: { title: string; slug: string; cover_url: string | null; authors: { name: string } | null } | null
}

export default function Profile() {
  const { user, profile, signOut, updateProfile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [saving, setSaving] = useState(false)

  const [reading, setReading] = useState<LibraryItem[]>([])
  const [listening, setListening] = useState<LibraryItem[]>([])
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "")
      setBio(profile.bio || "")
    }
  }, [profile])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [r, l, b, o] = await Promise.all([
        supabase
          .from("reading_progress")
          .select("book_id, percentage, current_page, total_pages, last_read_at, books(title, slug, cover_url, authors(name))")
          .eq("user_id", user.id)
          .order("last_read_at", { ascending: false }),
        supabase
          .from("listening_progress")
          .select("book_id, percentage, current_track, last_listened_at, books(title, slug, cover_url, authors(name))")
          .eq("user_id", user.id)
          .order("last_listened_at", { ascending: false }),
        supabase
          .from("bookmarks")
          .select("id, book_id, created_at, books(title, slug, cover_url, authors(name))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id, created_at, total_amount, status, order_items(id, quantity, format, unit_price, books(title, cover_url))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ])
      setReading((r.data as any) || [])
      setListening((l.data as any) || [])
      setBookmarks(b.data || [])
      setOrders(o.data || [])
      setLoadingData(false)
    }
    load()
  }, [user])

  if (!user) {
    navigate("/auth")
    return null
  }

  const handleSave = async () => {
    setSaving(true)
    await updateProfile({ display_name: displayName, bio })
    setSaving(false)
    toast({ title: "Profile updated!" })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate("/")
  }

  const removeBookmark = async (id: string) => {
    await supabase.from("bookmarks").delete().eq("id", id)
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    toast({ title: "Bookmark removed" })
  }

  const initials = (profile?.display_name || user.email || "U").slice(0, 2).toUpperCase()

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    shipped: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    delivered: "bg-green-500/15 text-green-400 border-green-500/20",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
  }

  const BookCard = ({ item, type }: { item: any; type: "read" | "listen" | "bookmark" }) => {
    const book = item.books
    if (!book) return null
    const pct = item.percentage || 0

    return (
      <Card className="border-border/30 overflow-hidden hover:border-primary/20 transition-colors bg-card/60">
        <CardContent className="p-0 flex gap-3">
          <Link to={`/book/${book.slug}`} className="shrink-0">
            <div className="w-[72px] h-[100px] bg-muted rounded-l-lg overflow-hidden">
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><BookCopy className="w-5 h-5 text-muted-foreground" /></div>
              )}
            </div>
          </Link>
          <div className="flex-1 py-2.5 pr-3 flex flex-col justify-between min-w-0">
            <div>
              <Link to={`/book/${book.slug}`} className="font-medium text-[13px] leading-tight line-clamp-2 hover:text-primary transition-colors">
                {book.title}
              </Link>
              <p className="text-[11px] text-muted-foreground mt-0.5">{book.authors?.name || ""}</p>
            </div>
            {type !== "bookmark" && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>{Math.round(pct)}% complete</span>
                </div>
                <Progress value={pct} className="h-1" />
              </div>
            )}
            <div className="mt-1.5">
              {type === "read" && (
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 rounded-lg" asChild>
                  <Link to={`/read/${book.slug}`}><Play className="w-3 h-3" /> Resume</Link>
                </Button>
              )}
              {type === "listen" && (
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 rounded-lg" asChild>
                  <Link to={`/book/${book.slug}`}><Headphones className="w-3 h-3" /> Listen</Link>
                </Button>
              )}
              {type === "bookmark" && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 rounded-lg" asChild>
                    <Link to={`/book/${book.slug}`}><Eye className="w-3 h-3" /> View</Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] rounded-lg" onClick={() => removeBookmark(item.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const EmptyState = ({ icon: Icon, text }: { icon: any; text: string }) => (
    <div className="text-center py-10 text-muted-foreground">
      <Icon className="w-8 h-8 mx-auto mb-2.5 opacity-30" />
      <p className="text-[13px]">{text}</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-24 pb-14">
        <div className="max-w-5xl mx-auto">
          {/* Profile Header */}
          <div className="flex items-center gap-5 mb-7">
            <Avatar className="w-16 h-16 border-2 border-primary/30">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-serif">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-serif font-bold text-foreground">{profile?.display_name || "User"}</h1>
              <p className="text-[13px] text-muted-foreground">{user.email}</p>
              <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{reading.length} reading</span>
                <span className="flex items-center gap-1"><Headphones className="w-3 h-3" />{listening.length} listening</span>
                <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{bookmarks.length} saved</span>
              </div>
            </div>
          </div>

          <Tabs defaultValue="reading" className="space-y-5">
            <TabsList className="bg-secondary/40 border border-border/30 flex-wrap h-auto gap-0.5 p-1">
              <TabsTrigger value="reading" className="gap-1.5 text-[13px]"><BookOpen className="w-3.5 h-3.5" /> Reading</TabsTrigger>
              <TabsTrigger value="listening" className="gap-1.5 text-[13px]"><Headphones className="w-3.5 h-3.5" /> Listening</TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5 text-[13px]"><Bookmark className="w-3.5 h-3.5" /> Bookmarks</TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5 text-[13px]"><ShoppingBag className="w-3.5 h-3.5" /> Orders</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-[13px]"><Settings className="w-3.5 h-3.5" /> Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="reading">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="w-4 h-4 text-primary" /> Continue Reading</CardTitle></CardHeader>
                <CardContent>
                  {loadingData ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : reading.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {reading.map((r) => <BookCard key={r.book_id} item={r} type="read" />)}
                    </div>
                  ) : (
                    <EmptyState icon={BookOpen} text="No books in progress. Start reading!" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="listening">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Headphones className="w-4 h-4 text-primary" /> Continue Listening</CardTitle></CardHeader>
                <CardContent>
                  {loadingData ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : listening.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {listening.map((l) => <BookCard key={l.book_id} item={l} type="listen" />)}
                    </div>
                  ) : (
                    <EmptyState icon={Headphones} text="No audiobooks in progress. Start listening!" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookmarks">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Bookmark className="w-4 h-4 text-primary" /> Bookmarked Books</CardTitle></CardHeader>
                <CardContent>
                  {loadingData ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : bookmarks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {bookmarks.map((b) => <BookCard key={b.id} item={b} type="bookmark" />)}
                    </div>
                  ) : (
                    <EmptyState icon={Bookmark} text="No bookmarked books yet." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShoppingBag className="w-4 h-4 text-primary" /> Order History</CardTitle></CardHeader>
                <CardContent>
                  {loadingData ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : orders.length > 0 ? (
                    <div className="space-y-3">
                      {orders.map((o) => (
                        <Card key={o.id} className="border-border/20 bg-secondary/20">
                          <CardContent className="p-3.5">
                            <div className="flex items-center justify-between mb-2.5">
                              <div className="flex items-center gap-2.5">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[13px]">{new Date(o.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                                <Badge variant="outline" className={`text-[11px] ${statusColors[o.status] || ""}`}>{o.status}</Badge>
                              </div>
                              <span className="font-bold text-[13px]">৳{o.total_amount}</span>
                            </div>
                            <div className="flex gap-2.5 overflow-x-auto pb-0.5">
                              {(o.order_items || []).map((item: any) => (
                                <div key={item.id} className="flex items-center gap-1.5 shrink-0 text-[13px]">
                                  <div className="w-7 h-10 bg-muted rounded overflow-hidden shrink-0">
                                    {item.books?.cover_url && <img src={item.books.cover_url} alt="" className="w-full h-full object-cover" />}
                                  </div>
                                  <div>
                                    <p className="text-[11px] line-clamp-1">{item.books?.title || "Book"}</p>
                                    <p className="text-[11px] text-muted-foreground">×{item.quantity} · ৳{item.unit_price}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={ShoppingBag} text="No orders yet." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Edit Profile</CardTitle></CardHeader>
                <CardContent className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Display Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Bio</Label>
                    <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself" className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="flex gap-2.5">
                    <Button onClick={handleSave} disabled={saving} className="btn-gold text-[13px]">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="outline" onClick={handleSignOut} className="gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10 text-[13px] rounded-xl">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </main>
  )
}
