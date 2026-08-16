// Canonical set of broadcaster-terms clauses an RJ must individually accept
// before going live — replaces one blanket "I accept" checkbox with an
// itemized record (see RjProfile.terms_accepted_clauses). All are required;
// acceptTerms (rj.ts) rejects anything short of the full set. Keep this list
// in sync with the matching UI copy in RjDashboard.tsx.
export const RJ_TERMS_CLAUSE_KEYS = [
  "prohibited_content",
  "recording_consent",
  "callin_consent",
  "complaint_system",
  "unpublish_on_complaint",
] as const;

export type RjTermsClauseKey = (typeof RJ_TERMS_CLAUSE_KEYS)[number];
