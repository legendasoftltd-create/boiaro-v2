/**
 * RjProfile also carries broadcast_token_hash, phone, and email — none of
 * which belong in a response reachable without auth. Use this select
 * anywhere an RJ's profile is exposed to a public/listener-facing
 * endpoint (REST or tRPC); reach for the full row only in RJ-self-service
 * or admin contexts.
 */
export const PUBLIC_RJ_PROFILE_SELECT = {
  id: true,
  user_id: true,
  stage_name: true,
  bio: true,
  avatar_url: true,
  specialty: true,
  is_approved: true,
  is_active: true,
} as const;
