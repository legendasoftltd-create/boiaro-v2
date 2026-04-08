import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail, getEmailTemplate } from "@/lib/emailService";

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

  // 1. Update application status
  const { error } = await supabase
    .from("role_applications")
    .update({ status: "approved", reviewed_by: reviewerId, verified: true } as any)
    .eq("id", applicationId);

  if (error) throw error;

  // 2. Grant role (ignore if already exists via unique constraint)
  await supabase.from("user_roles").insert({ user_id: userId, role: role as any });

  // 3. Get application data for creator record
  const { data: app } = await supabase
    .from("role_applications")
    .select("*")
    .eq("id", applicationId)
    .single() as any;

  const name = app?.display_name || app?.full_name || "Unknown";
  const bio = app?.bio || null;
  const email = app?.email || null;
  const avatar_url = app?.avatar_url || null;

  // 4. Check for existing entry to prevent duplicates, then insert
  if (role === "writer") {
    const { data: existing } = await (supabase.from("authors").select("id") as any).eq("user_id", userId).maybeSingle();
    if (!existing) {
      await supabase.from("authors").insert({ name, user_id: userId, status: "active", bio, email, avatar_url, linked_at: new Date().toISOString() } as any);
    }
  } else if (role === "publisher") {
    const { data: existing } = await (supabase.from("publishers").select("id") as any).eq("user_id", userId).maybeSingle();
    if (!existing) {
      await supabase.from("publishers").insert({ name, user_id: userId, status: "active", email, description: bio, linked_at: new Date().toISOString() } as any);
    }
  } else if (role === "narrator") {
    const { data: existing } = await (supabase.from("narrators").select("id") as any).eq("user_id", userId).maybeSingle();
    if (!existing) {
      await supabase.from("narrators").insert({ name, user_id: userId, status: "active", bio, email, avatar_url, linked_at: new Date().toISOString() } as any);
    }
  } else if (role === "rj") {
    const { data: existing } = await (supabase.from("rj_profiles") as any).select("id").eq("user_id", userId).maybeSingle();
    if (!existing) {
      await (supabase.from("rj_profiles") as any).insert({
        user_id: userId,
        stage_name: app?.display_name || name,
        bio,
        specialty: app?.message || null,
        status: "approved",
      });
    } else {
      await (supabase.from("rj_profiles") as any).update({ status: "approved" }).eq("user_id", userId);
    }
  }

  // 5. Update profile display_name if provided
  if (app?.display_name) {
    await supabase.from("profiles").update({ display_name: app.display_name, avatar_url: avatar_url || undefined }).eq("user_id", userId);
  }

  // Send approval email
  try {
    if (app?.email) {
      const template = await getEmailTemplate("creator_approved");
      if (template) {
        await sendTransactionalEmail({
          recipientEmail: app.email,
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
  const { data: app } = await supabase
    .from("role_applications")
    .select("email, display_name, full_name, requested_role")
    .eq("id", params.applicationId)
    .single() as any;

  await supabase
    .from("role_applications")
    .update({ status: "rejected", reviewed_by: params.reviewerId })
    .eq("id", params.applicationId);

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
            user_name: app.display_name || app.full_name || "User",
            role: app.requested_role,
          },
          idempotencyKey: `creator-rejected-${params.applicationId}`,
        });
      }
    }
  } catch (e) { console.error("Rejection email failed:", e); }
}
