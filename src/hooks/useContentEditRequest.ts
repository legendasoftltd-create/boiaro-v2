import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EditRequestPayload {
  contentType: "book" | "book_format";
  contentId: string;
  submittedBy: string;
  proposedChanges: Record<string, any>;
}

export function useContentEditRequest() {
  const [submitting, setSubmitting] = useState(false);

  const submitEditRequest = async ({ contentType, contentId, submittedBy, proposedChanges }: EditRequestPayload) => {
    setSubmitting(true);
    try {
      // Check for existing pending request
      const { data: existing } = await supabase
        .from("content_edit_requests" as any)
        .select("id")
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        // Update existing pending request
        const { error } = await supabase
          .from("content_edit_requests" as any)
          .update({ proposed_changes: proposedChanges, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing as any).id);

        if (error) { toast.error(error.message); setSubmitting(false); return false; }
        toast.success("Edit request updated — awaiting admin review");
      } else {
        // Create new request
        const { error } = await supabase
          .from("content_edit_requests" as any)
          .insert({
            content_type: contentType,
            content_id: contentId,
            submitted_by: submittedBy,
            proposed_changes: proposedChanges,
            status: "pending",
          } as any);

        if (error) { toast.error(error.message); setSubmitting(false); return false; }
        toast.success("Edit request submitted — awaiting admin review");
      }

      setSubmitting(false);
      return true;
    } catch {
      toast.error("Failed to submit edit request");
      setSubmitting(false);
      return false;
    }
  };

  const checkPendingRequest = async (contentType: string, contentId: string) => {
    const { data } = await supabase
      .from("content_edit_requests" as any)
      .select("id, status, created_at")
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .eq("status", "pending")
      .maybeSingle();

    return data as unknown as { id: string; status: string; created_at: string } | null;
  };

  return { submitEditRequest, checkPendingRequest, submitting };
}
