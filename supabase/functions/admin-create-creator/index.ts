import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paginated listUsers helper — fetches ALL auth users across pages
async function getAllAuthUsers(supabaseAdmin: any): Promise<any[]> {
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    allUsers.push(...users);
    if (users.length < perPage) break;
    page++;
  }
  return allUsers;
}

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
    if (!isAdmin) throw new Error("Not authorized — admin role required");

    const body = await req.json();
    const { action, email, password, role, profileTable, profileId, profileData } = body;

    const validTables = ["authors", "publishers", "narrators"];
    const validRoles = ["writer", "publisher", "narrator"];

    // Helper: structured audit log
    const logActivity = async (opts: {
      action: string;
      details: string;
      targetId: string;
      targetType: string;
      riskLevel?: string;
      oldValue?: string;
      newValue?: string;
    }) => {
      await supabaseAdmin.from("admin_activity_logs").insert({
        user_id: caller.id,
        user_name: caller.email || caller.id,
        action: opts.action,
        details: opts.details,
        target_type: opts.targetType,
        target_id: opts.targetId,
        module: "creator_linking",
        risk_level: opts.riskLevel || "medium",
        action_type: "update",
        old_value: opts.oldValue || null,
        new_value: opts.newValue || null,
      });
    };

    // Action: create a new auth user + assign role + link profile
    if (action === "create_creator") {
      if (!email || !password || !role || !profileTable) {
        throw new Error("Missing required fields: email, password, role, profileTable");
      }
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (!validRoles.includes(role)) throw new Error("Invalid role");
      if (!validTables.includes(profileTable)) throw new Error("Invalid profile table");

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: profileData?.name || email },
      });
      if (createErr) {
        if (createErr.message?.includes("already been registered")) {
          throw new Error("This email is already registered. Use a different email or link an existing account.");
        }
        throw createErr;
      }

      const userId = newUser.user.id;

      const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
      if (roleErr && !roleErr.message?.includes("duplicate")) {
        // Cleanup: delete orphan auth user since role assignment failed
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(`Role assignment failed: ${roleErr.message}`);
      }

      if (profileData && !profileId) {
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from(profileTable)
          .insert({ ...profileData, user_id: userId, email, linked_at: new Date().toISOString() })
          .select("id")
          .single();
        if (profileErr) throw new Error(`Profile creation failed: ${profileErr.message}`);

        await logActivity({
          action: "Creator account created & linked",
          details: `Created auth user ${email} and linked to ${profileTable} profile ${profile.id}`,
          targetId: profile.id,
          targetType: profileTable,
          newValue: JSON.stringify({ user_id: userId, email, profile_type: profileTable, profile_id: profile.id, changed_by: caller.id }),
        });

        return new Response(JSON.stringify({
          success: true, userId, profileId: profile.id,
          message: `Creator account created. Email: ${email}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (profileId) {
        const { error: linkErr } = await supabaseAdmin
          .from(profileTable)
          .update({ user_id: userId, email, linked_at: new Date().toISOString() })
          .eq("id", profileId);
        if (linkErr) throw new Error(`Profile link failed: ${linkErr.message}`);

        await logActivity({
          action: "Creator account created & linked to existing profile",
          details: `Created auth user ${email} and linked to ${profileTable}/${profileId}`,
          targetId: profileId,
          targetType: profileTable,
          newValue: JSON.stringify({ user_id: userId, email, profile_type: profileTable, profile_id: profileId, changed_by: caller.id }),
        });

        return new Response(JSON.stringify({
          success: true, userId, profileId,
          message: `Creator account created and linked to existing profile.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: link an existing profile to an existing auth user
    if (action === "link_existing") {
      if (!profileTable || !profileId || !email) throw new Error("Missing: profileTable, profileId, email");
      if (!validTables.includes(profileTable)) throw new Error("Invalid profile table");

      const allUsers = await getAllAuthUsers(supabaseAdmin);
      const targetUser = allUsers.find((u: any) => u.email === email);
      if (!targetUser) throw new Error("No auth user found with this email. Create an account first.");

      // Check duplicate link
      const { data: existingLink } = await supabaseAdmin
        .from(profileTable)
        .select("id, name")
        .eq("user_id", targetUser.id)
        .neq("id", profileId)
        .maybeSingle();
      if (existingLink) {
        throw new Error(`This user is already linked to another ${profileTable.slice(0, -1)}: "${existingLink.name}".`);
      }

      // Get old link info
      const { data: oldProfile } = await supabaseAdmin
        .from(profileTable)
        .select("user_id, name")
        .eq("id", profileId)
        .single();
      const oldUserId = oldProfile?.user_id;

      // If changing link, revoke old user's role if no other profiles
      if (oldUserId && oldUserId !== targetUser.id) {
        const roleMap: Record<string, string> = { authors: "writer", publishers: "publisher", narrators: "narrator" };
        const creatorRole = roleMap[profileTable];
        if (creatorRole) {
          const { data: otherLinks } = await supabaseAdmin
            .from(profileTable)
            .select("id")
            .eq("user_id", oldUserId)
            .neq("id", profileId)
            .limit(1);
          if (!otherLinks?.length) {
            await supabaseAdmin.from("user_roles").delete()
              .eq("user_id", oldUserId).eq("role", creatorRole as any);
          }
        }
      }

      // Assign creator role to new user
      if (role) {
        const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: targetUser.id, role });
        if (roleErr && !roleErr.message?.includes("duplicate")) {
          throw new Error(`Role assignment failed for linked user: ${roleErr.message}`);
        }
      }

      // Link profile with linked_at timestamp
      const { error: linkErr } = await supabaseAdmin
        .from(profileTable)
        .update({ user_id: targetUser.id, email, linked_at: new Date().toISOString() })
        .eq("id", profileId);
      if (linkErr) throw new Error(`Link failed: ${linkErr.message}`);

      const actionLabel = oldUserId ? "Link changed" : "Link created";
      await logActivity({
        action: actionLabel,
        details: oldUserId
          ? `Changed linked user from ${oldUserId} to ${targetUser.id} (${email}) on ${profileTable}/${profileId} (${oldProfile?.name})`
          : `Linked user ${targetUser.id} (${email}) to ${profileTable}/${profileId} (${oldProfile?.name})`,
        targetId: profileId,
        targetType: profileTable,
        riskLevel: oldUserId ? "high" : "medium",
        oldValue: oldUserId ? JSON.stringify({ old_user_id: oldUserId, profile_type: profileTable, profile_id: profileId }) : null,
        newValue: JSON.stringify({ new_user_id: targetUser.id, email, profile_type: profileTable, profile_id: profileId, changed_by: caller.id }),
      });

      return new Response(JSON.stringify({
        success: true, userId: targetUser.id, profileId,
        message: `Profile linked to user ${email}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: unlink a profile from its user
    if (action === "unlink_profile") {
      if (!profileTable || !profileId) throw new Error("Missing: profileTable, profileId");
      if (!validTables.includes(profileTable)) throw new Error("Invalid profile table");

      const { data: currentProfile } = await supabaseAdmin
        .from(profileTable)
        .select("user_id, email, name")
        .eq("id", profileId)
        .single();

      if (!currentProfile?.user_id) throw new Error("This profile is not linked to any user.");

      const removedUserId = currentProfile.user_id;
      const removedEmail = currentProfile.email;

      // Clear user_id, email, and linked_at
      const { error: unlinkErr } = await supabaseAdmin
        .from(profileTable)
        .update({ user_id: null, email: null, linked_at: null })
        .eq("id", profileId);
      if (unlinkErr) throw new Error(`Unlink failed: ${unlinkErr.message}`);

      // Remove creator role if no other profiles linked
      const roleMap: Record<string, string> = { authors: "writer", publishers: "publisher", narrators: "narrator" };
      const creatorRole = roleMap[profileTable];
      if (creatorRole) {
        const { data: otherLinks } = await supabaseAdmin
          .from(profileTable)
          .select("id")
          .eq("user_id", removedUserId)
          .limit(1);

        if (!otherLinks?.length) {
          await supabaseAdmin.from("user_roles").delete()
            .eq("user_id", removedUserId).eq("role", creatorRole as any);
        }
      }

      await logActivity({
        action: "Link removed",
        details: `Unlinked user ${removedUserId} (${removedEmail}) from ${profileTable}/${profileId} (${currentProfile.name}). Email cleared. Creator role ${creatorRole} revoked.`,
        targetId: profileId,
        targetType: profileTable,
        riskLevel: "high",
        oldValue: JSON.stringify({ old_user_id: removedUserId, email: removedEmail, profile_type: profileTable, profile_id: profileId }),
        newValue: JSON.stringify({ user_id: null, email: null, changed_by: caller.id }),
      });

      return new Response(JSON.stringify({
        success: true, profileId,
        message: `Account unlinked from ${currentProfile.name}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: search users (paginated, active only)
    if (action === "search_users") {
      const query = body.query?.trim();
      if (!query || query.length < 2) throw new Error("Search query must be at least 2 characters");

      // Search active profiles
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, full_name, phone, avatar_url, is_active")
        .or(`display_name.ilike.%${query}%,full_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .neq("is_active", false)
        .is("deleted_at", null)
        .limit(20);

      // Paginated auth user search
      const allUsers = await getAllAuthUsers(supabaseAdmin);
      const emailMatches = allUsers
        .filter((u: any) => u.email?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 20);

      const userIds = new Set<string>();
      const results: any[] = [];

      for (const em of emailMatches) {
        userIds.add(em.id);
        const profile = profiles?.find((p: any) => p.user_id === em.id);
        if (profile === undefined) {
          const { data: checkProfile } = await supabaseAdmin
            .from("profiles")
            .select("is_active, deleted_at")
            .eq("user_id", em.id)
            .maybeSingle();
          if (checkProfile?.is_active === false || checkProfile?.deleted_at) continue;
        }
        results.push({
          user_id: em.id,
          email: em.email,
          display_name: profile?.display_name || em.user_metadata?.display_name || em.email,
          avatar_url: profile?.avatar_url || null,
          phone: profile?.phone || null,
        });
      }

      for (const p of (profiles || [])) {
        if (!userIds.has(p.user_id)) {
          userIds.add(p.user_id);
          const authUser = allUsers.find((u: any) => u.id === p.user_id);
          results.push({
            user_id: p.user_id,
            email: authUser?.email || null,
            display_name: p.display_name || p.full_name || "Unknown",
            avatar_url: p.avatar_url || null,
            phone: p.phone || null,
          });
        }
      }

      // Fetch roles + existing links
      const matchedIds = results.map(r => r.user_id);
      if (matchedIds.length === 0) {
        return new Response(JSON.stringify({ success: true, users: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: rolesData } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", matchedIds);
      const rolesMap: Record<string, string[]> = {};
      for (const r of (rolesData || [])) {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      }

      const [authorsLinks, publishersLinks, narratorsLinks] = await Promise.all([
        supabaseAdmin.from("authors").select("user_id, name").in("user_id", matchedIds),
        supabaseAdmin.from("publishers").select("user_id, name").in("user_id", matchedIds),
        supabaseAdmin.from("narrators").select("user_id, name").in("user_id", matchedIds),
      ]);

      const existingLinks: Record<string, { type: string; name: string }[]> = {};
      for (const a of (authorsLinks.data || [])) {
        if (!existingLinks[a.user_id]) existingLinks[a.user_id] = [];
        existingLinks[a.user_id].push({ type: "author", name: a.name });
      }
      for (const p of (publishersLinks.data || [])) {
        if (!existingLinks[p.user_id]) existingLinks[p.user_id] = [];
        existingLinks[p.user_id].push({ type: "publisher", name: p.name });
      }
      for (const n of (narratorsLinks.data || [])) {
        if (!existingLinks[n.user_id]) existingLinks[n.user_id] = [];
        existingLinks[n.user_id].push({ type: "narrator", name: n.name });
      }

      for (const r of results) {
        r.roles = rolesMap[r.user_id] || ["user"];
        r.existing_links = existingLinks[r.user_id] || [];
      }

      return new Response(JSON.stringify({ success: true, users: results.slice(0, 20) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get linked user details (with linked_at from profile)
    if (action === "get_linked_user") {
      const userId = body.userId;
      if (!userId) throw new Error("Missing userId");

      // Get auth user by ID (no need to paginate — direct lookup)
      const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authErr || !authUser) throw new Error("User not found");

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, full_name, avatar_url, phone, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: rolesData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      // Get linked_at from the profile table if provided
      let linkedAt = null;
      if (body.profileTable && body.profileId && validTables.includes(body.profileTable)) {
        const { data: creatorProfile } = await supabaseAdmin
          .from(body.profileTable)
          .select("linked_at")
          .eq("id", body.profileId)
          .maybeSingle();
        linkedAt = creatorProfile?.linked_at || null;
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          user_id: authUser.id,
          email: authUser.email,
          display_name: profile?.display_name || authUser.user_metadata?.display_name || authUser.email,
          avatar_url: profile?.avatar_url || null,
          phone: profile?.phone || null,
          created_at: authUser.created_at,
          linked_at: linkedAt,
          roles: (rolesData || []).map((r: any) => r.role),
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: get all creator profile links for a user
    if (action === "get_user_links") {
      const userId = body.userId;
      if (!userId) throw new Error("Missing userId");

      const [authorsRes, publishersRes, narratorsRes] = await Promise.all([
        supabaseAdmin.from("authors").select("id, name, name_en, avatar_url, status").eq("user_id", userId),
        supabaseAdmin.from("publishers").select("id, name, name_en, logo_url, status").eq("user_id", userId),
        supabaseAdmin.from("narrators").select("id, name, name_en, avatar_url, status").eq("user_id", userId),
      ]);

      return new Response(JSON.stringify({
        success: true,
        links: {
          authors: authorsRes.data || [],
          publishers: publishersRes.data || [],
          narrators: narratorsRes.data || [],
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Unknown action.");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
