import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { trpc } from "@/lib/trpc"
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
  Play, Eye, Trash2, BookCopy, Clock, Phone, Camera, Loader2, Smartphone, Award, Coins,
  TrendingUp, Share2, BarChart3,
} from "lucide-react"
import { stripHtml } from "@/lib/stripHtml"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { useToast } from "@/hooks/use-toast"
import { toMediaUrl } from "@/lib/mediaUrl"
import { shareCardImage } from "@/lib/shareCard"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? ""

export default function Profile() {
  const { user, profile, signOut, updateProfile, setProfileAvatar } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get("tab") === "weekly-report" ? "weekly-report" : "reading"
  const [sharingBadgeId, setSharingBadgeId] = useState<string | null>(null)
  const [sharingReport, setSharingReport] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "")
      setBio(profile.bio || "")
      setPhone(profile.phone || "")
    }
  }, [profile])

  const utils = trpc.useUtils()
  const { data: reading = [], isLoading: readingLoading } = trpc.profiles.readingProgress.useQuery(undefined, { enabled: !!user })
  const { data: listening = [], isLoading: listeningLoading } = trpc.profiles.listeningProgress.useQuery(undefined, { enabled: !!user })
  const { data: bookmarks = [], isLoading: bookmarksLoading } = trpc.books.userBookmarks.useQuery(undefined, { enabled: !!user })
  const { data: orders = [], isLoading: ordersLoading } = trpc.profiles.userOrders.useQuery(undefined, { enabled: !!user })
  const { data: devices = [], isLoading: devicesLoading } = trpc.devices.myDevices.useQuery(undefined, { enabled: !!user })
  const { data: badgeDefs = [] } = trpc.gamification.badgeDefinitions.useQuery(undefined, { enabled: !!user })
  const { data: userBadges = [] } = trpc.gamification.badges.useQuery(undefined, { enabled: !!user })
  const earnedBadgeIds = new Set((userBadges as any[]).map((b: any) => b.badge_id))
  const badgeIdByDefId = new Map((userBadges as any[]).map((b: any) => [b.badge_id, b.id]))
  const { data: weeklyReport, isLoading: weeklyReportLoading } = trpc.gamification.myWeeklyReport.useQuery(undefined, { enabled: !!user })

  const handleShareBadge = async (userBadgeId: string, title: string) => {
    setSharingBadgeId(userBadgeId)
    try {
      await shareCardImage(`/api/v1/share/badge/${userBadgeId}.png`, "badge.png", title, "BoiAro-তে আমার নতুন অর্জন!")
    } catch {
      toast({ title: "শেয়ার করা যায়নি", variant: "destructive" })
    } finally {
      setSharingBadgeId(null)
    }
  }

  const handleShareWeeklyReport = async () => {
    setSharingReport(true)
    try {
      await shareCardImage("/api/v1/share/weekly-report.png", "weekly-report.png", "আমার সাপ্তাহিক রিডিং রিপোর্ট", "BoiAro-তে এই সপ্তাহে আমার পড়া!")
    } catch {
      toast({ title: "শেয়ার করা যায়নি", variant: "destructive" })
    } finally {
      setSharingReport(false)
    }
  }

  const bookmarkMutation = trpc.books.bookmark.useMutation({
    onSuccess: () => utils.books.userBookmarks.invalidate(),
  })
  const revokeDeviceMutation = trpc.devices.revoke.useMutation({
    onSuccess: () => utils.devices.myDevices.invalidate(),
    onError: (e) => toast({ title: "Failed to log out device", description: e.message, variant: "destructive" }),
  })

  if (!user) {
    navigate("/auth")
    return null
  }

  const isOtpUser = user.email.endsWith("@boiaro.local")

  const handleSave = async () => {
    setSaving(true)
    await updateProfile({
      display_name: displayName,
      bio,
      phone: phone.trim() || undefined,
      ...(isOtpUser && email.trim() ? { email: email.trim() } : {}),
    })
    setSaving(false)
    toast({ title: "Profile updated!" })
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ""

    setUploadingAvatar(true)
    try {
      const token = localStorage.getItem("access_token")
      const formData = new FormData()
      formData.append("image", file)

      const res = await fetch(`${API_BASE}/api/v1/profile/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest" },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || "Upload failed")
      }

      const data = await res.json() as { avatar_url: string }
      setProfileAvatar(data.avatar_url)
      toast({ title: "Photo updated!" })
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate("/")
  }

  const removeBookmark = (bookId: string) => {
    bookmarkMutation.mutate({ bookId })
    toast({ title: "Bookmark removed" })
  }

  const initials = (profile?.display_name || user.email || "U").slice(0, 2).toUpperCase()
  const avatarSrc = toMediaUrl(profile?.avatar_url)

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    shipped: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    delivered: "bg-green-500/15 text-green-400 border-green-500/20",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
  }

  const BookCard = ({ item, type }: { item: any; type: "read" | "listen" | "bookmark" }) => {
    const book = item.book || item.books
    if (!book) return null
    const pct = item.percentage || 0

    return (
      <Card className="border-border/30 overflow-hidden hover:border-primary/20 transition-colors bg-card/60">
        <CardContent className="p-0 flex gap-3">
          <Link to={`/book/${book.slug}`} className="shrink-0">
            <div className="w-[72px] h-[100px] bg-muted rounded-l-lg overflow-hidden">
              {book.cover_url ? (
                <img src={toMediaUrl(book.cover_url) || ""} alt={book.title} className="w-full h-full object-cover" />
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
              <p className="text-[11px] text-muted-foreground mt-0.5">{book.author?.name || ""}{book.translator?.name ? ` · Tr: ${book.translator.name}` : ""}</p>
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
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] rounded-lg" onClick={() => removeBookmark(item.book_id)}>
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
            {/* Clickable avatar with upload overlay */}
            <div className="relative shrink-0 cursor-pointer group" onClick={handleAvatarClick}>
              <Avatar className="w-16 h-16 border-2 border-primary/30">
                <AvatarImage src={avatarSrc || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-serif">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar
                  ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                  : <Camera className="w-5 h-5 text-white" />}
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarFileChange}
            />

            <div>
              <h1 className="text-xl font-serif font-bold text-foreground">{profile?.display_name || "User"}</h1>
              <p className="text-[13px] text-muted-foreground">
                {isOtpUser ? "ইমেইল সেট করা হয়নি" : user.email}
              </p>
              {profile?.phone && (
                <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" />{profile.phone}
                </p>
              )}
              <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{reading.length} reading</span>
                <span className="flex items-center gap-1"><Headphones className="w-3 h-3" />{listening.length} listening</span>
                <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{bookmarks.length} saved</span>
              </div>
            </div>
          </div>

          <Tabs defaultValue={defaultTab} className="space-y-5">
            <TabsList className="bg-secondary/40 border border-border/30 flex-wrap h-auto gap-0.5 p-1">
              <TabsTrigger value="reading" className="gap-1.5 text-[13px]"><BookOpen className="w-3.5 h-3.5" /> Reading</TabsTrigger>
              <TabsTrigger value="listening" className="gap-1.5 text-[13px]"><Headphones className="w-3.5 h-3.5" /> Listening</TabsTrigger>
              <TabsTrigger value="badges" className="gap-1.5 text-[13px]"><Award className="w-3.5 h-3.5" /> Badges</TabsTrigger>
              <TabsTrigger value="weekly-report" className="gap-1.5 text-[13px]"><BarChart3 className="w-3.5 h-3.5" /> Weekly Report</TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5 text-[13px]"><Bookmark className="w-3.5 h-3.5" /> Bookmarks</TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5 text-[13px]"><ShoppingBag className="w-3.5 h-3.5" /> Orders</TabsTrigger>
              <TabsTrigger value="devices" className="gap-1.5 text-[13px]"><Smartphone className="w-3.5 h-3.5" /> Devices</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-[13px]"><Settings className="w-3.5 h-3.5" /> Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="reading">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="w-4 h-4 text-primary" /> Continue Reading</CardTitle></CardHeader>
                <CardContent>
                  {readingLoading ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : reading.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(reading as any[]).map((r: any) => <BookCard key={r.book_id} item={r} type="read" />)}
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
                  {listeningLoading ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : listening.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(listening as any[]).map((l: any) => <BookCard key={l.book_id} item={l} type="listen" />)}
                    </div>
                  ) : (
                    <EmptyState icon={Headphones} text="No audiobooks in progress. Start listening!" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="badges">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Award className="w-4 h-4 text-primary" /> Badges & Achievements</CardTitle></CardHeader>
                <CardContent>
                  {(badgeDefs as any[]).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {(badgeDefs as any[]).map((b: any) => {
                        const earned = earnedBadgeIds.has(b.id)
                        return (
                          <div key={b.id} className={`p-3 rounded-xl border text-center transition-all ${earned ? "border-primary/30 bg-primary/5" : "border-border/20 bg-secondary/10 opacity-50"}`}>
                            <Award className={`w-8 h-8 mx-auto mb-2 ${earned ? "text-primary" : "text-muted-foreground"}`} />
                            <p className={`text-[13px] font-medium ${earned ? "text-foreground" : "text-muted-foreground"}`}>{b.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{stripHtml(b.description || "")}</p>
                            {b.coin_reward && b.coin_reward > 0 && (
                              <Badge variant="outline" className="mt-1.5 text-[10px]"><Coins className="w-2.5 h-2.5 mr-0.5" />{b.coin_reward}</Badge>
                            )}
                            {earned && (
                              <>
                                <p className="text-[10px] text-primary mt-1">✓ Earned</p>
                                <Button
                                  size="sm" variant="ghost"
                                  className="mt-1.5 h-6 text-[10px] gap-1 px-2"
                                  disabled={sharingBadgeId === badgeIdByDefId.get(b.id)}
                                  onClick={() => {
                                    const userBadgeId = badgeIdByDefId.get(b.id)
                                    if (userBadgeId) handleShareBadge(userBadgeId, b.title)
                                  }}
                                >
                                  <Share2 className="w-3 h-3" /> Share
                                </Button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyState icon={Award} text="No badges available yet." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="weekly-report">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="w-4 h-4 text-primary" /> এই সপ্তাহের রিপোর্ট</CardTitle>
                  {weeklyReport && weeklyReport.totalSeconds > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={sharingReport} onClick={handleShareWeeklyReport}>
                      <Share2 className="w-3.5 h-3.5" /> {sharingReport ? "..." : "Share"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {weeklyReportLoading ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : weeklyReport && weeklyReport.totalSeconds > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-xl border border-border/20 bg-secondary/10 text-center">
                          <p className="text-3xl font-bold text-primary">{weeklyReport.totalMinutes}</p>
                          <p className="text-[12px] text-muted-foreground mt-1">মিনিট পড়া/শোনা</p>
                        </div>
                        <div className="p-4 rounded-xl border border-border/20 bg-secondary/10 text-center">
                          <p className="text-3xl font-bold text-primary">{weeklyReport.bookCount}</p>
                          <p className="text-[12px] text-muted-foreground mt-1">টি বই</p>
                        </div>
                      </div>
                      {weeklyReport.weekOverWeekPercent !== null && (
                        <p className="text-[13px] flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                          গত সপ্তাহের তুলনায় {weeklyReport.weekOverWeekPercent >= 0 ? "+" : ""}{weeklyReport.weekOverWeekPercent}%
                        </p>
                      )}
                      {weeklyReport.books.length > 0 && (
                        <div>
                          <p className="text-[12px] text-muted-foreground mb-2">এই সপ্তাহে পড়া বইগুলো</p>
                          <div className="flex flex-wrap gap-2">
                            {weeklyReport.books.map((b: any) => (
                              <Badge key={b.id} variant="outline" className="text-[11px]">{b.title}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState icon={BarChart3} text="এই সপ্তাহে এখনো কোনো পড়া/শোনার তথ্য নেই।" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookmarks">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Bookmark className="w-4 h-4 text-primary" /> Bookmarked Books</CardTitle></CardHeader>
                <CardContent>
                  {bookmarksLoading ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : bookmarks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(bookmarks as any[]).map((b: any) => <BookCard key={b.id} item={b} type="bookmark" />)}
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
                  {ordersLoading ? (
                    <p className="text-muted-foreground animate-pulse text-[13px]">Loading...</p>
                  ) : orders.length > 0 ? (
                    <div className="space-y-3">
                      {(orders as any[]).map((o: any) => (
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
                              {(o.items || []).map((item: any) => {
                                const book = item.book_format?.book
                                return (
                                  <div key={item.id} className="flex items-center gap-1.5 shrink-0 text-[13px]">
                                    <div className="w-7 h-10 bg-muted rounded overflow-hidden shrink-0">
                                      {book?.cover_url && <img src={toMediaUrl(book.cover_url) || ""} alt="" className="w-full h-full object-cover" />}
                                    </div>
                                    <div>
                                      <p className="text-[11px] line-clamp-1">{book?.title || "Book"}</p>
                                      <p className="text-[11px] text-muted-foreground">×{item.quantity} · ৳{item.price}</p>
                                    </div>
                                  </div>
                                )
                              })}
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

            <TabsContent value="devices">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Devices</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {devicesLoading ? (
                    <p className="text-[13px] text-muted-foreground">Loading devices...</p>
                  ) : devices.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No devices on record yet.</p>
                  ) : (
                    devices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-secondary/40 border border-border/30">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate">{d.device_name || "Unknown device"}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {d.platform || "unknown"} • last active {new Date(d.last_active_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="sm" variant="outline"
                          className="shrink-0 gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10 text-[12px] rounded-lg"
                          disabled={revokeDeviceMutation.isPending}
                          onClick={() => revokeDeviceMutation.mutate({ id: d.id })}
                        >
                          <LogOut className="w-3.5 h-3.5" /> Log out
                        </Button>
                      </div>
                    ))
                  )}
                  <p className="text-[11px] text-muted-foreground">Logging out a device frees up a slot if your plan limits concurrent devices — it does not sign that device out immediately.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="text-base">Edit Profile</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Avatar upload in settings */}
                  <div className="flex items-center gap-4">
                    <div className="relative cursor-pointer group" onClick={handleAvatarClick}>
                      <Avatar className="w-14 h-14 border-2 border-primary/30">
                        <AvatarImage src={avatarSrc || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-serif">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {uploadingAvatar
                          ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                          : <Camera className="w-4 h-4 text-white" />}
                      </div>
                      {uploadingAvatar && (
                        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">Profile Photo</p>
                      <p className="text-[12px] text-muted-foreground">JPG, PNG or WebP · max 5MB</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 text-[12px] gap-1.5 rounded-lg"
                        onClick={handleAvatarClick}
                        disabled={uploadingAvatar}
                      >
                        {uploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                        {uploadingAvatar ? "Uploading..." : "Change Photo"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Display Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  {isOtpUser && (
                    <div className="space-y-1.5">
                      <Label className="text-[13px]">Email Address</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="h-10 rounded-xl bg-secondary/40 border-border/40"
                      />
                      <p className="text-[11px] text-muted-foreground">আপনি ফোন দিয়ে লগইন করেছেন — একটি বাস্তব ইমেইল যুক্ত করুন।</p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Phone Number</Label>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+880 1XXXXXXXXX"
                      className="h-10 rounded-xl bg-secondary/40 border-border/40"
                    />
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
