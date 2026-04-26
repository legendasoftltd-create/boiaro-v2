import { createTrpcClient } from "@/lib/trpc";
import { sendTransactionalEmail, getEmailTemplate } from "@/lib/emailService";

const trpcClient = createTrpcClient();

/**
 * Handles creator role approval:
 * 1. Updates application status
 * 2. Grants user_roles entry
 * 3. Creates entry in the appropriate creator table with application data
 */
export async function approveCreatorApplication(params: {
  applicationId: string;
  userId: string;
  role: string;
  reviewerId?: string;
}) {
  const { applicationId, userId, role, reviewerId } = params;
  void reviewerId;
  await trpcClient.admin.approveApplication.mutate({
    applicationId,
    userId,
    role,
  });

  // Send approval email
  try {
    const applications = await trpcClient.admin.listRoleApplications.query({});
    const approved = (applications || []).find((a: any) => a.id === applicationId);
    const recipientEmail = null;
    const name = approved?.display_name || "User";
    if (recipientEmail) {
      const template = await getEmailTemplate("creator_approved");
      if (template) {
        await sendTransactionalEmail({
          recipientEmail,
          templateType: "creator_approved",
          subject: template.subject,
          templateData: { user_name: name, role },
          idempotencyKey: `creator-approved-${applicationId}`,
        });
      }
    }
  } catch (e) { console.error("Approval email failed:", e); }
}

export async function rejectCreatorApplication(params: {
  applicationId: string;
  reviewerId?: string;
}) {
  void params.reviewerId;
  const applications = await trpcClient.admin.listRoleApplications.query({});
  const app = (applications || []).find((a: any) => a.id === params.applicationId);
  await trpcClient.admin.rejectApplication.mutate({ applicationId: params.applicationId });

  // Send rejection email
  try {
    if (app?.email) {
      const template = await getEmailTemplate("creator_rejected");
      if (template) {
        await sendTransactionalEmail({
          recipientEmail: app.email,
          templateType: "creator_rejected",
          subject: template.subject,
          templateData: {
            user_name: app?.display_name || "User",
            role: app?.applied_role || "creator",
          },
          idempotencyKey: `creator-rejected-${params.applicationId}`,
        });
      }
    }
  } catch (e) { console.error("Rejection email failed:", e); }
}
