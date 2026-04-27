import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CreateCreatorOpts {
  email: string;
  password: string;
  confirmPassword: string;
  role: "writer" | "publisher" | "narrator";
  profileTable: "authors" | "publishers" | "narrators";
  profileData: Record<string, any>;
}

interface LinkCreatorOpts {
  email: string;
  role: "writer" | "publisher" | "narrator";
  profileTable: "authors" | "publishers" | "narrators";
  profileId: string;
}

export function useCreatorAccount() {
  const [saving, setSaving] = useState(false);

  const createMutation = trpc.admin.createCreator.useMutation();
  const linkMutation = trpc.admin.linkCreatorProfile.useMutation();

  const createCreatorWithAccount = async (opts: CreateCreatorOpts) => {
    const { email, password, confirmPassword, role, profileTable, profileData } = opts;

    if (!email.trim()) { toast.error("Email is required"); return null; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return null; }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return null; }

    setSaving(true);
    try {
      const result = await createMutation.mutateAsync({
        email: email.trim(),
        password,
        role,
        profileTable,
        profileData,
      });
      toast.success("Creator account created successfully");
      return result;
    } catch (err: any) {
      toast.error(err.message || "Failed to create creator");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const linkExistingProfile = async (opts: LinkCreatorOpts) => {
    const { email, role, profileTable, profileId } = opts;

    if (!email.trim()) { toast.error("Email is required"); return null; }

    setSaving(true);
    try {
      const result = await linkMutation.mutateAsync({
        email: email.trim(),
        role,
        profileTable,
        profileId,
      });
      toast.success("Profile linked successfully");
      return result;
    } catch (err: any) {
      toast.error(err.message || "Failed to link");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { createCreatorWithAccount, linkExistingProfile, saving };
}
