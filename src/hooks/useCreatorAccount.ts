import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  const createCreatorWithAccount = async (opts: CreateCreatorOpts) => {
    const { email, password, confirmPassword, role, profileTable, profileData } = opts;

    if (!email.trim()) { toast.error("Email is required"); return null; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return null; }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return null; }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: {
          action: "create_creator",
          email: email.trim(),
          password,
          role,
          profileTable,
          profileData,
        },
      });

      if (error) { toast.error(error.message || "Failed to create creator"); return null; }
      if (data?.error) { toast.error(data.error); return null; }

      toast.success(data.message || "Creator account created successfully");
      return data;
    } catch (err: any) {
      toast.error(err.message || "Unexpected error");
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
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: {
          action: "link_existing",
          email: email.trim(),
          role,
          profileTable,
          profileId,
        },
      });

      if (error) { toast.error(error.message || "Failed to link"); return null; }
      if (data?.error) { toast.error(data.error); return null; }

      toast.success(data.message || "Profile linked successfully");
      return data;
    } catch (err: any) {
      toast.error(err.message || "Unexpected error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { createCreatorWithAccount, linkExistingProfile, saving };
}
