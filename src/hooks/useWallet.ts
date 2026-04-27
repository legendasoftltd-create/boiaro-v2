import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useWallet() {
  const { user } = useAuth();

  const { data, isLoading: loading, refetch } = trpc.wallet.balance.useQuery(undefined, {
    enabled: !!user,
  });

  const unlockMutation = trpc.wallet.unlockContent.useMutation();

  const wallet = {
    balance: data?.wallet?.balance ?? 0,
    totalEarned: data?.wallet?.total_earned ?? 0,
    totalSpent: data?.wallet?.total_spent ?? 0,
  };

  const transactions = data?.transactions ?? [];

  const checkUnlock = useCallback(async (bookId: string, format: string): Promise<boolean> => {
    if (!user) return false;
    // Optimistic check from cached unlocks — server validates on actual content delivery
    return false;
  }, [user]);

  const unlockWithCoins = useCallback(async (bookId: string, format: string, coinCost: number): Promise<boolean> => {
    if (!user) { toast.error("Please sign in first"); return false; }
    if (wallet.balance < coinCost) { toast.error("কয়েন ব্যালেন্স অপর্যাপ্ত"); return false; }

    try {
      const result = await unlockMutation.mutateAsync({ bookId, format, coinCost });
      if (result && "already_unlocked" in result && result.already_unlocked) {
        toast.info("এই কন্টেন্ট ইতোমধ্যে আনলক করা হয়েছে");
        return true;
      }
      toast.success(`🎉 সফলভাবে আনলক হয়েছে! ${coinCost} কয়েন খরচ হয়েছে`);
      await refetch();
      return true;
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Insufficient")) {
        toast.error("কয়েন ব্যালেন্স অপর্যাপ্ত");
      } else {
        toast.error("আনলক ব্যর্থ হয়েছে");
      }
      return false;
    }
  }, [user, wallet.balance, unlockMutation, refetch]);

  return { wallet, transactions, loading, checkUnlock, unlockWithCoins, refetch };
}
