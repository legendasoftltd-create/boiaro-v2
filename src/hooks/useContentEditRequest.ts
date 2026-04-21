import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface EditRequestPayload {
  contentType: "book" | "book_format";
  contentId: string;
  submittedBy: string;
  proposedChanges: Record<string, any>;
}

export function useContentEditRequest() {
  const [submitting, setSubmitting] = useState(false);

  const submitMutation = trpc.admin.submitEditRequest.useMutation();
  const checkQuery = trpc.admin.checkPendingEditRequest;

  const submitEditRequest = async ({ contentType, contentId, proposedChanges }: EditRequestPayload) => {
    setSubmitting(true);
    try {
      await submitMutation.mutateAsync({
        contentType,
        contentId,
        proposedChanges,
      });
      toast.success("Edit request submitted — awaiting admin review");
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit edit request");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const checkPendingRequest = async (contentType: string, contentId: string) => {
    try {
      const result = await checkQuery.fetch({ contentType, contentId });
      return result as { id: string; status: string; created_at: string } | null;
    } catch {
      return null;
    }
  };

  return { submitEditRequest, checkPendingRequest, submitting };
}
