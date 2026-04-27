import { useState } from "react";
import { Headphones, Lock, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface AudiobookPaywallModalProps {
  open: boolean;
  bookTitle: string;
  bookSlug: string;
  bookId: string;
  audiobookPrice: number;
  previewPercentage?: number;
  onUnlocked: () => void;
  onClose: () => void;
}

export function AudiobookPaywallModal({
  open,
  bookTitle,
  bookSlug,
  bookId,
  audiobookPrice,
  previewPercentage = 15,
  onUnlocked,
  onClose,
}: AudiobookPaywallModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!open) return null;

  const isFree = audiobookPrice === 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pb-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-serif font-bold text-foreground mb-1">
            Preview Limit Reached
          </h2>
          <p className="text-sm text-muted-foreground">
            Unlock <span className="text-foreground font-medium">{bookTitle}</span> to continue listening
          </p>
        </div>

        <div className="flex justify-center mb-4">
          <Badge variant="outline" className="border-primary/30 text-primary gap-1.5 px-3 py-1">
            <Headphones className="w-3.5 h-3.5" />
            {previewPercentage}% free preview ended
          </Badge>
        </div>

        <div className="px-6 pb-6 space-y-3">
          {!user ? (
            <>
              <p className="text-center text-sm text-muted-foreground mb-2">
                Please login to purchase or unlock this audiobook
              </p>
              <Button className="w-full gap-2" onClick={() => navigate("/auth")}>
                Sign In to Continue
              </Button>
            </>
          ) : (
            <>
              {!isFree && (
                <Button
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => navigate(`/checkout?book_id=${bookId}&format=audiobook`)}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Buy Full Audiobook — ৳{audiobookPrice}
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Go back to unlock individual chapters with ads or coins
              </p>
            </>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
