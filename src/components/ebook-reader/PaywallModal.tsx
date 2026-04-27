/**
 * PAYWALL MODAL — shown only when shouldEnforcePreviewLimit is true in EbookReader.
 *
 * Access rule: This modal must NEVER appear for free books or books with
 * an active purchase/unlock. The caller (EbookReader) gates this via
 * useEbookAccess.hasFullAccess. If you see this modal for a purchased book,
 * the bug is in the access check, NOT here.
 */
import { useState } from "react";
import { BookOpen, Lock, ShoppingCart, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PaywallModalProps {
  open: boolean;
  bookTitle: string;
  bookSlug: string;
  bookId: string;
  ebookPrice: number;
  previewPercentage?: number;
  onUnlocked: () => void;
  onClose: () => void;
}

export function PaywallModal({
  open,
  bookTitle,
  bookSlug,
  bookId,
  ebookPrice,
  previewPercentage = 15,
  onUnlocked,
  onClose,
}: PaywallModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [buying, setBuying] = useState(false);

  if (!open) return null;

  const isFree = ebookPrice === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* No close button - user must purchase or go back */}

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-serif font-bold text-foreground mb-1">
            Unlock Full Book to Continue
          </h2>
          <p className="text-sm text-muted-foreground">
            {previewPercentage === 0
              ? <>This book requires purchase to read: <span className="text-foreground font-medium">{bookTitle}</span></>
              : <>Your free preview of <span className="text-foreground font-medium">{bookTitle}</span> has ended</>
            }
          </p>
        </div>

        {/* Preview badge */}
        {previewPercentage > 0 && (
          <div className="flex justify-center mb-4">
            <Badge variant="outline" className="border-primary/30 text-primary gap-1.5 px-3 py-1">
              <BookOpen className="w-3.5 h-3.5" />
              {previewPercentage}% free preview completed
            </Badge>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-6 pb-6 space-y-3">
          {!user ? (
            <>
              <p className="text-center text-sm text-muted-foreground mb-2">
                Please login to purchase or unlock this book
              </p>
              <Button
                className="w-full gap-2"
                onClick={() => navigate("/auth")}
              >
                Sign In to Continue
              </Button>
            </>
          ) : (
            <>
              {/* Buy button */}
              {!isFree && (
                <Button
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={buying}
                  onClick={() => {
                    setBuying(true);
                    navigate(`/checkout?book_id=${bookId}&format=ebook`);
                  }}
                >
                  {buying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  {buying ? "Redirecting..." : `Buy & Read Full Book — ৳${ebookPrice}`}
                </Button>
              )}

              {/* Coin unlock disabled for ebooks — cash purchase only */}
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onClose}
          >
            Back to Book Details
          </Button>
        </div>
      </div>
    </div>
  );
}
