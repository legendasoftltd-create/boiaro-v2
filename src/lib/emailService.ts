import { createTrpcClient } from "@/lib/trpc";

/**
 * Email infrastructure status flag.
 * Set to true once full email domain + edge functions are configured.
 * Until then, emails are logged but not sent — preventing silent failures.
 */
const EMAIL_INFRA_READY = false;
const trpcClient = createTrpcClient();

/**
 * Send a transactional email using the platform's built-in email system.
 * If email infrastructure is not yet configured, logs the event and returns
 * gracefully without attempting to send (no errors, no crashes).
 */
export async function sendTransactionalEmail({
  recipientEmail,
  templateType,
  subject,
  templateData = {},
  idempotencyKey,
}: {
  recipientEmail: string;
  templateType: string;
  subject: string;
  templateData?: Record<string, string>;
  idempotencyKey: string;
}) {
  // Replace template variables in subject
  let finalSubject = subject;
  for (const [key, value] of Object.entries(templateData)) {
    finalSubject = finalSubject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  // If email infra is not ready, log the event and return gracefully
  if (!EMAIL_INFRA_READY) {
    console.info(`[Email] Skipped (infra not ready): ${templateType} → ${recipientEmail}`);
    try {
      await trpcClient.admin.logEmailEvent.mutate({
        recipient_email: recipientEmail,
        template_type: templateType,
        subject: finalSubject,
        status: "skipped",
        error_message: "Email infrastructure not configured yet",
      });
    } catch {
      // Silently ignore logging failures
    }
    return { success: false, error: "Email infrastructure not configured" };
  }

  try {
    // Placeholder: keep behavior while infra is not configured.
    const error = EMAIL_INFRA_READY
      ? null
      : { message: `Email sending not configured for idempotency key ${idempotencyKey}` };

    // Log the attempt
    await trpcClient.admin.logEmailEvent.mutate({
      recipient_email: recipientEmail,
      template_type: templateType,
      subject: finalSubject,
      status: error ? "failed" : "sent",
      error_message: error?.message || null,
    });

    return { success: !error, error: error?.message };
  } catch (err: any) {
    // Log failure gracefully
    try {
      await trpcClient.admin.logEmailEvent.mutate({
        recipient_email: recipientEmail,
        template_type: templateType,
        subject: finalSubject,
        status: "failed",
        error_message: err.message || "Unknown error",
      });
    } catch {
      // Silently ignore logging failures
    }

    return { success: false, error: err.message };
  }
}

/**
 * Helper to get email template from database and replace variables
 */
export async function getEmailTemplate(templateType: string): Promise<{
  subject: string;
  body_html: string;
  body_text: string;
} | null> {
  const data = await trpcClient.admin.getActiveEmailTemplate.query({ templateType });
  if (!data) return null;
  return {
    subject: data.subject,
    body_html: data.body,
    body_text: data.body,
  };
}

/**
 * Replace template variables like {{user_name}} in a string
 */
export function replaceTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
