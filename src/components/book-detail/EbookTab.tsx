import { BookOpen, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useNavigate } from "react-router-dom"
import { useReadingProgress } from "@/hooks/useReadingProgress"
import { useAuth } from "@/contexts/AuthContext"
import { useEbookAccess } from "@/hooks/useEbookAccess"
import type { MasterBook, EbookFormat } from "@/lib/types"

interface Props { book: MasterBook; ebook: EbookFormat }

export function EbookTab({ book, ebook }: Props) {
  const isFree = book.isFree || ebook.price === 0
  const navigate = useNavigate()
  const { user } = useAuth()
  const { progress } = useReadingProgress(book.id)
  const { hasFullAccess, previewLimit, loading: accessLoading } = useEbookAccess(book.id, isFree, ebook.pages || 100)

  const pct = progress?.percentage || 0
  const hasStarted = pct > 0
  const owned = hasFullAccess && !isFree
  const hasPreview = previewLimit > 0
  const showProgress = user && hasStarted

  /**
   * CTA LOGIC — Two distinct actions:
   *
   * "Read eBook" button:
   *   - Free book / owned → opens reader (full access)
   *   - Unpaid user with preview enabled → opens reader (preview enforced by EbookReader)
   *   - Unpaid user with 0% preview → hidden (nothing to read without purchase)
   *   - Logged-out user → opens reader (preview enforced, sign-in prompted by paywall)
   *
   * "Buy & Read Now" button:
   *   - Only shown for paid ebooks when user hasn't purchased
   *   - Logged-out user → redirects to checkout (auth handled there)
   *   - Logged-in unpaid user → redirects to checkout
   *   - Owned/free → hidden
   */

  const handleRead = () => {
    console.debug("[EbookCTA] Read action", {
      bookId: book.id,
      userId: user?.id ?? null,
      isFree,
      owned,
      hasPreview,
      decision: "open_reader",
    })
    navigate(`/read/${book.slug}`)
  }

  const handleBuy = () => {
    console.debug("[EbookCTA] Buy action", {
      bookId: book.id,
      userId: user?.id ?? null,
      isFree,
      owned,
      decision: "redirect_checkout",
    })
    navigate(`/checkout?book_id=${book.id}&format=ebook`)
  }

  // Determine read button text
  const readButtonText = hasStarted
    ? `Resume`
    : owned || isFree
    ? "Read Now"
    : hasPreview
    ? "Preview"
    : null // No read button if 0% preview and not owned

  // Show buy button only for paid ebooks that user hasn't purchased
  const showBuyButton = !isFree && !owned

  // Build compact stats string
  const statParts: string[] = []
  if (ebook.pages > 0) statParts.push(`${ebook.pages} pages`)
  if (ebook.fileSize && ebook.fileSize !== "—" && ebook.fileSize !== "N/A") statParts.push(ebook.fileSize)
  if (hasPreview) statParts.push(`${previewLimit}% preview`)
  statParts.push("ePub / PDF")

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card className="bg-card border-primary/30 overflow-hidden shadow-md shadow-primary/5 ring-1 ring-primary/10">
        <CardContent className="px-5 py-4">
          {/* Price */}
          <div className="mb-3">
            <span className="text-3xl font-extrabold text-primary font-serif tracking-wide">
              {isFree ? "Free" : owned ? "Owned" : `৳${ebook.price}`}
            </span>
            {owned && (
              <Badge className="ml-2 align-middle bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">✓ Purchased</Badge>
            )}
            {showBuyButton && (
              <p className="text-xs text-muted-foreground mt-0.5">Unlock full book</p>
            )}
            {isFree && (
              <p className="text-xs text-muted-foreground mt-0.5">Read the full book for free</p>
            )}
          </div>

          {/* CTA */}
          <div className="grid w-full gap-2 mb-3" style={{ gridTemplateColumns: showBuyButton && readButtonText ? '1fr 1fr' : '1fr' }}>
            {showBuyButton && (
              <Button
                size="default"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1.5 w-full whitespace-nowrap text-sm px-3"
                onClick={handleBuy}
                disabled={accessLoading}
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Buy</span>
                <span className="hidden sm:inline">Buy — ৳{ebook.price}</span>
              </Button>
            )}
            {readButtonText && (
              <Button
                size="default"
                variant={showBuyButton ? "outline" : "default"}
                className={
                  showBuyButton
                    ? "font-semibold gap-1.5 w-full whitespace-nowrap text-sm px-3 border-primary/40 text-primary"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1.5 w-full whitespace-nowrap text-sm px-3"
                }
                onClick={handleRead}
                disabled={accessLoading}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                {readButtonText}
              </Button>
            )}
          </div>

          {/* Stats — single compact line */}
          <p className="text-xs text-muted-foreground tracking-wide">
            {statParts.join(" · ")}
          </p>
        </CardContent>
      </Card>

      {showProgress && (
        <Card className="bg-card border-border">
          <CardContent className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Reading Progress</p>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Page {progress?.currentPage} of {progress?.totalPages || ebook.pages}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
