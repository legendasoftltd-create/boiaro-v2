import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BookOpen, Headphones, ShoppingBag, Bookmark, User,
  ArrowRight, Library, Settings, Crown, Coins, UserCheck, Users
} from "lucide-react"
import { Link } from "react-router-dom"
import { useUserRole } from "@/hooks/useUserRole"
import { FollowButton } from "@/components/FollowButton"

interface RecentItem {
  book_id: string
  percentage: number
  last_read_at?: string
  last_listened_at?: string
  books: { title: string; slug: string; cover_url: string | null } | null
}

export default function UserDashboard() {
  const { user, profile } = useAuth()
  const { roles } = useUserRole()
  const [recentReading, setRecentReading] = useState<RecentItem[]>([])
  const [recentListening, setRecentListening] = useState<RecentItem[]>([])
  const [orderCount, setOrderCount] = useState(0)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [activeSub, setActiveSub] = useState<any>(null)
  const [coinBalance, setCoinBalance] = useState(0)
  const [coinEarned, setCoinEarned] = useState(0)
  const [coinSpent, setCoinSpent] = useState(0)
  const [recentCoinTxs, setRecentCoinTxs] = useState<any[]>([])
  const [followingAuthors, setFollowingAuthors] = useState<any[]>([])
  const [followingNarrators, setFollowingNarrators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [readRes, listenRes, orderRes, bmRes, subRes, coinRes, coinTxRes] = await Promise.all([
        supabase
          .from("reading_progress")
          .select("book_id, percentage, last_read_at, books(title, slug, cover_url)")
          .eq("user_id", user.id)
          .order("last_read_at", { ascending: false })
          .limit(4),
        supabase
          .from("listening_progress")
          .select("book_id, percentage, last_listened_at, books(title, slug, cover_url)")
          .eq("user_id", user.id)
          .order("last_listened_at", { ascending: false })
          .limit(4),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("bookmarks")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("user_subscriptions" as any)
          .select("*, subscription_plans(name, code)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("user_coins" as any)
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("coin_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ])
      setRecentReading((readRes.data as any) || [])
      setRecentListening((listenRes.data as any) || [])
      setOrderCount(orderRes.count || 0)
      setBookmarkCount(bmRes.count || 0)
      const subs = (subRes.data as any[] || [])
      setActiveSub(subs[0] || null)
      const cData = coinRes.data as any
      if (cData) { setCoinBalance(cData.balance || 0); setCoinEarned(cData.total_earned || 0); setCoinSpent(cData.total_spent || 0); }
      setRecentCoinTxs((coinTxRes.data as any[]) || [])

      // Load following
      const { data: followsData } = await supabase
        .from("follows" as any)
        .select("profile_id, profile_type")
        .eq("user_id", user.id)

      if (followsData && followsData.length > 0) {
        const authorIds = (followsData as any[]).filter(f => f.profile_type === "author").map(f => f.profile_id)
        const narratorIds = (followsData as any[]).filter(f => f.profile_type === "narrator").map(f => f.profile_id)

        if (authorIds.length > 0) {
          const { data: authors } = await supabase.from("authors").select("id, name, avatar_url").in("id", authorIds)
          setFollowingAuthors(authors || [])
        }
        if (narratorIds.length > 0) {
          const { data: narrators } = await supabase.from("narrators").select("id, name, avatar_url").in("id", narratorIds)
          setFollowingNarrators(narrators || [])
        }
      }

      setLoading(false)
    }
    load()
  }, [user])

  if (!user) return null

  const stats = [
    { label: "Reading", value: recentReading.length, icon: BookOpen, color: "text-primary" },
    { label: "Listening", value: recentListening.length, icon: Headphones, color: "text-blue-400" },
    { label: "Orders", value: orderCount, icon: ShoppingBag, color: "text-emerald-400" },
    { label: "Bookmarks", value: bookmarkCount, icon: Bookmark, color: "text-amber-400" },
  ]


  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
          <Avatar className="h-16 w-16 border-2 border-primary/30">
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-serif">
              {(profile?.display_name || user.email)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-serif font-bold">
              স্বাগতম, {profile?.display_name || "Reader"}!
            </h1>
            <p className="text-muted-foreground text-sm">{user.email}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {roles.map(r => (
                <Badge key={r} variant="secondary" className="text-[11px] capitalize">{r}</Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/profile"><Settings className="w-4 h-4 mr-1.5" /> Profile</Link>
            </Button>
            {/* Deduplicate: show one Creator Panel button for any creator role */}
            {roles.some(r => ["writer", "publisher", "narrator"].includes(r)) && (
              <Button size="sm" className="btn-gold text-[12px]" asChild>
                <Link to="/creator">Creator Panel <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            )}
            {roles.includes("admin") && (
              <Button size="sm" className="btn-gold text-[12px]" asChild>
                <Link to="/admin">Admin Panel <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map(s => (
            <Card key={s.label} className="border-border/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-secondary/60">
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "—" : s.value}</p>
                  <p className="text-[12px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Subscription Status */}
        {activeSub && (
          <Card className="mb-8 border-primary/30 bg-primary/5">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Subscription</p>
                  <p className="font-bold text-primary">{activeSub.subscription_plans?.name}</p>
                  {activeSub.end_date && (
                    <p className="text-xs text-muted-foreground">Expires: {new Date(activeSub.end_date).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400">Active</Badge>
            </CardContent>
          </Card>
        )}

        {/* Wallet */}
        <Card className="mb-8 border-border/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">মাই ওয়ালেট</p>
                  <p className="text-2xl font-bold text-primary">{coinBalance} <span className="text-sm font-normal text-muted-foreground">কয়েন</span></p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/wallet">বিস্তারিত <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-secondary/40 text-center">
                <p className="text-lg font-bold text-emerald-400">{coinEarned}</p>
                <p className="text-[11px] text-muted-foreground">মোট অর্জিত</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/40 text-center">
                <p className="text-lg font-bold text-red-400">{coinSpent}</p>
                <p className="text-[11px] text-muted-foreground">মোট খরচ</p>
              </div>
            </div>
            {recentCoinTxs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">সাম্প্রতিক লেনদেন</p>
                <div className="space-y-1.5">
                  {recentCoinTxs.slice(0, 3).map((tx: any) => (
                    <div key={tx.id} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{tx.description || tx.type}</span>
                      <span className={tx.amount > 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Reading */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> সম্প্রতি পড়া
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : recentReading.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো বই পড়া হয়নি</p>
              ) : (
                recentReading.map(item => (
                  <Link
                    key={item.book_id}
                    to={`/book/${item.books?.slug}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors"
                  >
                    {item.books?.cover_url ? (
                      <img src={item.books.cover_url} className="w-10 h-14 rounded object-cover" alt="" />
                    ) : (
                      <div className="w-10 h-14 rounded bg-secondary/60 flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.books?.title}</p>
                      <Progress value={item.percentage} className="h-1.5 mt-1" />
                      <p className="text-[11px] text-muted-foreground mt-0.5">{Math.round(item.percentage)}% সম্পন্ন</p>
                    </div>
                  </Link>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                <Link to="/profile">সব দেখুন <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <Headphones className="w-4 h-4 text-blue-400" /> সম্প্রতি শোনা
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : recentListening.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো অডিওবুক শোনা হয়নি</p>
              ) : (
                recentListening.map(item => (
                  <Link
                    key={item.book_id}
                    to={`/book/${item.books?.slug}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors"
                  >
                    {item.books?.cover_url ? (
                      <img src={item.books.cover_url} className="w-10 h-14 rounded object-cover" alt="" />
                    ) : (
                      <div className="w-10 h-14 rounded bg-secondary/60 flex items-center justify-center">
                        <Headphones className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.books?.title}</p>
                      <Progress value={item.percentage} className="h-1.5 mt-1" />
                      <p className="text-[11px] text-muted-foreground mt-0.5">{Math.round(item.percentage)}% সম্পন্ন</p>
                    </div>
                  </Link>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                <Link to="/profile">সব দেখুন <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Following */}
        {(followingAuthors.length > 0 || followingNarrators.length > 0) && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {followingAuthors.length > 0 && (
              <Card className="border-border/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-serif flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-primary" /> Following Writers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {followingAuthors.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={a.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{(a.name || "?")[0]}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium flex-1 truncate">{a.name}</p>
                      <FollowButton profileId={a.id} profileType="author" size="sm" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {followingNarrators.length > 0 && (
              <Card className="border-border/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-serif flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" /> Following Narrators
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {followingNarrators.map((n: any) => (
                    <div key={n.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={n.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{(n.name || "?")[0]}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium flex-1 truncate">{n.name}</p>
                      <FollowButton profileId={n.id} profileType="narrator" size="sm" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <Card className="border-border/30 mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-serif">দ্রুত লিঙ্ক</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/"><Library className="w-5 h-5" /> বই খুঁজুন</Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/wallet"><Coins className="w-5 h-5" /> ওয়ালেট</Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/orders"><ShoppingBag className="w-5 h-5" /> অর্ডার</Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/profile"><User className="w-5 h-5" /> প্রোফাইল</Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/subscriptions"><Crown className="w-5 h-5" /> সাবস্ক্রিপশন</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  )
}
