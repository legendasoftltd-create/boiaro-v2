import { createTrpcClient } from "@/lib/trpc";

const trpcClient = createTrpcClient();

/**
 * Approve a creator role application.
 * Email notification is handled server-side by the approveApplication procedure.
 */
export async function approveCreatorApplication(params: {
  applicationId: string;
  userId: string;
  role: string;
  reviewerId?: string;
}) {
  void params.reviewerId;
  return trpcClient.admin.approveApplication.mutate({
    applicationId: params.applicationId,
    userId: params.userId,
    role: params.role,
  });
}

/**
 * Reject a creator role application.
 * Email notification is handled server-side by the rejectApplication procedure.
 */
export async function rejectCreatorApplication(params: {
  applicationId: string;
  reviewerId?: string;
}) {
  void params.reviewerId;
  return trpcClient.admin.rejectApplication.mutate({
    applicationId: params.applicationId,
  });
}
