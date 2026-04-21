import { useAuth } from "@/contexts/AuthContext"
import { trpc } from "@/lib/trpc"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BookOpen, Headphones, ShoppingBag, Bookmark, Coins, Crown,
  ArrowRight, Library, Settings, UserCheck,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useUserRole } from "@/hooks/useUserRole"

export default function UserDashboard() {
  const { user, profile } = useAuth()
  const { roles } = useUserRole()

  // Real tRPC data
  const { data: walletData } = trpc.wallet.balance.useQuery(undefined, { enabled: !!user })
  const { data: ordersData } = trpc.orders.myOrders.useQuery(undefined, { enabled: !!user })
  const { data: bookmarksData } = trpc.books.userBookmarks.useQuery(undefined, { enabled: !!user })
  const { data: readingProgress } = trpc.profiles.readingProgress.useQuery(undefined, { enabled: !!user })

  if (!user) return null

  const orders = (ordersData as any)?.orders ?? ordersData ?? []
  const orderCount = orders.length
  const bookmarkCount = (bookmarksData as any[])?.length ?? 0
  const walletObj = (walletData as any)?.wallet
  const coinBalance = walletObj?.balance ?? 0
  const coinEarned = walletObj?.total_earned ?? 0
  const coinSpent = walletObj?.total_spent ?? 0

  // reading_progress from tRPC (profiles.readingProgress)
  const recentReading = (readingProgress as any[])?.slice(0, 4) ?? []

  const stats = [
    { label: "Reading", value: recentReading.length, icon: BookOpen, color: "text-primary" },
    { label: "Orders", value: orderCount, icon: ShoppingBag, color: "text-emerald-400" },
    { label: "Bookmarks", value: bookmarkCount, icon: Bookmark, color: "text-amber-400" },
    { label: "Coins", value: coinBalance, icon: Coins, color: "text-yellow-400" },
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
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild>
              <Link to="/profile"><Settings className="w-4 h-4 mr-1.5" /> Profile</Link>
            </Button>
            {roles.some(r => ["writer", "publisher", "narrator"].includes(r)) && (
              <Button size="sm" className="btn-gold text-[12px]" asChild>
                <Link to="/creator">Creator Panel <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            )}
            {roles.includes("rj") && (
              <Button size="sm" className="btn-gold text-[12px]" asChild>
                <Link to="/rj">RJ Panel <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
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
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-[12px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/40 text-center">
                <p className="text-lg font-bold text-emerald-400">{coinEarned}</p>
                <p className="text-[11px] text-muted-foreground">মোট অর্জিত</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/40 text-center">
                <p className="text-lg font-bold text-red-400">{coinSpent}</p>
                <p className="text-[11px] text-muted-foreground">মোট খরচ</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Reading Progress */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> সম্প্রতি পড়া
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentReading.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো বই পড়া হয়নি</p>
              ) : (
                recentReading.map((item: any) => (
                  <Link
                    key={item.book_id}
                    to={`/book/${item.books?.slug ?? item.book_id}`}
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
                      <p className="text-sm font-medium truncate">{item.books?.title ?? "Unknown"}</p>
                      <Progress value={item.percentage ?? 0} className="h-1.5 mt-1" />
                      <p className="text-[11px] text-muted-foreground mt-0.5">{Math.round(item.percentage ?? 0)}% সম্পন্ন</p>
                    </div>
                  </Link>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                <Link to="/profile">সব দেখুন <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>

          {/* Recent Orders */}
          <Card className="border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" /> সাম্প্রতিক অর্ডার
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orderCount === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো অর্ডার নেই</p>
              ) : (
                orders.slice(0, 4).map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
                    <div>
                      <p className="text-sm font-medium">#{order.id.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{order.status}</p>
                    </div>
                    <p className="text-sm font-bold">৳{order.total_amount ?? 0}</p>
                  </div>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                <Link to="/orders">সব দেখুন <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-border/30">
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
                <Link to="/subscriptions"><Crown className="w-5 h-5" /> সাবস্ক্রিপশন</Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/invite"><UserCheck className="w-5 h-5" /> রেফার করুন</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  )
}
