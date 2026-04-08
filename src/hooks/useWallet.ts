import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface WalletData {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

interface CoinTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
  expires_at: string | null;
  source: string | null;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, totalEarned: 0, totalSpent: 0 });
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    if (!user) return;
    const [walletRes, txRes] = await Promise.all([
      supabase.from("user_coins" as any).select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("coin_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    const w = walletRes.data as any;
    if (w) {
      setWallet({ balance: w.balance || 0, totalEarned: w.total_earned || 0, totalSpent: w.total_spent || 0 });
    }
    setTransactions((txRes.data as CoinTransaction[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const checkUnlock = useCallback(async (bookId: string, format: string): Promise<boolean> => {
    if (!user) return false;
    const { data } = await supabase
      .from("content_unlocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("format", format)
      .eq("status", "active")
      .maybeSingle();
    return !!data;
  }, [user]);

  const unlockWithCoins = useCallback(async (bookId: string, format: string, coinCost: number): Promise<boolean> => {
    if (!user) { toast.error("Please sign in first"); return false; }
    if (wallet.balance < coinCost) { toast.error("কয়েন ব্যালেন্স অপর্যাপ্ত"); return false; }

    const alreadyUnlocked = await checkUnlock(bookId, format);
    if (alreadyUnlocked) { toast.info("এই কন্টেন্ট ইতোমধ্যে আনলক করা হয়েছে"); return true; }

    const refId = `unlock_${bookId}_${format}_${user.id}`;

    const { error: unlockErr } = await supabase.from("content_unlocks").upsert({
      user_id: user.id,
      book_id: bookId,
      format,
      coins_spent: coinCost,
      unlock_method: "coin",
      status: "active",
    }, { onConflict: "user_id,book_id,format" } as any);
    if (unlockErr) { toast.error("আনলক ব্যর্থ হয়েছে"); return false; }

    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: user.id,
      p_amount: -coinCost,
      p_type: "spend",
      p_description: `কন্টেন্ট আনলক - ${format}`,
      p_reference_id: refId,
      p_source: "content_unlock",
    });

    if (rpcErr) { toast.error("কয়েন কাটা ব্যর্থ হয়েছে"); return false; }

    setWallet(prev => ({ ...prev, balance: prev.balance - coinCost, totalSpent: prev.totalSpent + coinCost }));
    toast.success(`🎉 সফলভাবে আনলক হয়েছে! ${coinCost} কয়েন খরচ হয়েছে`);

    try {
      await supabase.functions.invoke("distribute-coin-revenue", {
        body: { book_id: bookId, format, coins_spent: coinCost, user_id: user.id },
      });
    } catch {
    }

    await fetchWallet();
    return true;
  }, [user, wallet, checkUnlock, fetchWallet]);

  return { wallet, transactions, loading, checkUnlock, unlockWithCoins, refetch: fetchWallet };
}
