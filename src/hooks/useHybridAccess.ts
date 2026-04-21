/**
 * Hybrid access hook: checks subscription → coin unlock → purchase → preview.
 * Delegates to wallet.checkHybridAccess tRPC procedure.
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface HybridAccessState {
  hasAccess: boolean;
  accessMethod: "free" | "subscription" | "coin" | "purchase" | "preview" | "none";
  accessError: string | null;
  loading: boolean;
  checkAccess: () => Promise<void>;
  markUnlocked: () => void;
}

export function useHybridAccess(
  bookId: string | null,
  format: "ebook" | "audiobook",
  isFree: boolean
): HybridAccessState {
  const { user } = useAuth();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState<{
    hasAccess: boolean;
    method: HybridAccessState["accessMethod"];
  } | null>(null);

  const query = trpc.wallet.checkHybridAccess.useQuery(
    { bookId: bookId!, format },
    { enabled: !!bookId && !!user && !isFree }
  );

  const checkAccess = useCallback(async () => {
    setAccessError(null);
    setManualOverride(null);
    await query.refetch();
  }, [query]);

  useEffect(() => {
    if (query.data && (query.data as any)?.reason === "invalid_format") {
      setAccessError("This content format is not supported or invalid.");
      toast.error("This content format is not supported or invalid.");
    }
  }, [query.data]);

  const markUnlocked = useCallback(() => {
    setManualOverride({ hasAccess: true, method: "coin" });
    setAccessError(null);
  }, []);

  if (!bookId) {
    return { hasAccess: false, accessMethod: "none", accessError: null, loading: false, checkAccess, markUnlocked };
  }

  if (isFree) {
    return { hasAccess: true, accessMethod: "free", accessError: null, loading: false, checkAccess, markUnlocked };
  }

  if (!user) {
    return {
      hasAccess: format === "ebook",
      accessMethod: format === "ebook" ? "preview" : "none",
      accessError: null,
      loading: false,
      checkAccess,
      markUnlocked,
    };
  }

  if (manualOverride) {
    return { hasAccess: manualOverride.hasAccess, accessMethod: manualOverride.method, accessError, loading: false, checkAccess, markUnlocked };
  }

  const data = query.data as any;
  return {
    hasAccess: data?.granted ?? false,
    accessMethod: data?.method ?? "none",
    accessError,
    loading: query.isLoading,
    checkAccess,
    markUnlocked,
  };
}
