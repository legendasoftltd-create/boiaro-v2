import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Not authorized");

    const body = await req.json();
    const { action, userId, tempPassword, userIds } = body;

    if (action === "send_password_reset") {
      // Get user email
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!user?.email) throw new Error("User email not found");

      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: "Password reset email sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_temp_password") {
      if (!tempPassword || tempPassword.length < 6) throw new Error("Password must be at least 6 characters");

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: "Temporary password set" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_email") {
      const { newEmail } = body;
      if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Valid email required");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: newEmail,
        email_confirm: true,
      });
      if (error) throw error;

      // Sync display in profiles if needed
      await supabaseAdmin.from("profiles").update({ updated_at: new Date().toISOString() }).eq("user_id", userId);

      return new Response(JSON.stringify({ success: true, message: "Email updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_user_meta") {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
      return new Response(JSON.stringify({
        email: user?.email,
        created_at: user?.created_at,
        last_sign_in_at: user?.last_sign_in_at,
        email_confirmed_at: user?.email_confirmed_at,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_users_meta") {
      const ids: string[] = userIds || [];
      const result: any[] = [];
      // Fetch in batches of 50
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        for (const uid of batch) {
          try {
            const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(uid);
            if (user) {
              result.push({
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at,
                email_confirmed_at: user.email_confirmed_at,
              });
            }
          } catch {}
        }
      }
      return new Response(JSON.stringify({ users: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (err) {
    await captureException(err, { functionName: "admin-manage-user" });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
