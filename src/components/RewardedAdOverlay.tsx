import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tv, X } from "lucide-react";
import { useAdConfig } from "@/hooks/useAdConfig";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

interface Props {
  open: boolean;
  onCompleted: () => void;
  onSkipped: () => void;
  adLabel?: string;
}

function loadAdsenseScript(publisherId: string): Promise<void> {
  return new Promise(resolve => {
    if (document.querySelector(`script[data-adsbygoogle-pub="${publisherId}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.adsbygooglePub = publisherId;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // resolve anyway, ad may still work
    document.head.appendChild(s);
  });
}

// Duration the user must watch before reward is granted (seconds)
const AD_WATCH_SECONDS = 15;
// Simulated ad duration when no real provider is set
const SIMULATION_SECONDS = 5;

export function RewardedAdOverlay({ open, onCompleted, onSkipped, adLabel = "অ্যাড" }: Props) {
  const { config, isLoading } = useAdConfig();
  const [countdown, setCountdown] = useState(0);
  const [adReady, setAdReady] = useState(false);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startedRef = useRef(false);

  const hasRealAd = !isLoading && config.systemEnabled &&
    config.providerType === "adsense" &&
    config.adsensePublisherId &&
    config.rewardedUnitId;

  const totalSeconds = hasRealAd ? AD_WATCH_SECONDS : SIMULATION_SECONDS;

  useEffect(() => {
    if (!open) {
      setCountdown(0);
      setAdReady(false);
      startedRef.current = false;
      clearInterval(timerRef.current);
      return;
    }

    setCountdown(totalSeconds);
    startedRef.current = true;

    async function initAd() {
      if (hasRealAd) {
        await loadAdsenseScript(config.adsensePublisherId);
        // Push the ad unit after script is ready
        if (adContainerRef.current) {
          try {
            window.adsbygoogle = window.adsbygoogle || [];
            window.adsbygoogle.push({});
          } catch {}
        }
      }
      setAdReady(true);

      // Start countdown
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    initAd();

    return () => clearInterval(timerRef.current);
  }, [open]);

  // When countdown hits 0, auto-complete
  useEffect(() => {
    if (open && adReady && countdown === 0 && startedRef.current) {
      onCompleted();
    }
  }, [countdown, adReady, open]);

  const progressPct = totalSeconds > 0 ? ((totalSeconds - countdown) / totalSeconds) * 100 : 100;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onSkipped(); }}>
      <DialogContent
        className="w-[calc(100vw-32px)] max-w-[480px] p-0 gap-0 overflow-hidden rounded-2xl"
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <Tv className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{adLabel} দেখছেন...</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {countdown > 0 && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1 font-mono tabular-nums">
                {countdown}s
              </span>
            )}
            {countdown === 0 ? (
              <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={onCompleted}>
                রিওয়ার্ড নিন
              </Button>
            ) : (
              <button
                onClick={onSkipped}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title="বাতিল করুন"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Ad content area */}
        <div className="min-h-[200px] sm:min-h-[250px] flex flex-col items-center justify-center bg-background p-4">
          {hasRealAd ? (
            <div ref={adContainerRef} className="w-full flex justify-center overflow-hidden">
              <ins
                className="adsbygoogle"
                style={{ display: "block", width: "100%", minHeight: "60px" }}
                data-ad-client={config.adsensePublisherId}
                data-ad-slot={config.rewardedUnitId}
                data-ad-format="auto"
                data-full-width-responsive="true"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center px-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Tv className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm sm:text-base">অ্যাড দেখা হচ্ছে</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {countdown > 0 ? `আর ${countdown} সেকেন্ড...` : "সম্পন্ন!"}
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center px-4 pb-3 leading-relaxed">
          পুরো অ্যাড দেখুন এবং রিওয়ার্ড পান
        </p>
      </DialogContent>
    </Dialog>
  );
}
