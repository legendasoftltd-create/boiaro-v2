-- AlterTable
ALTER TABLE "rj_profiles" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

-- Backfill from the most recent approval-log action per RJ (most accurate),
-- falling back to a best-guess from the existing booleans when no log row
-- exists for that RJ at all.
UPDATE "rj_profiles" rp
SET "status" = COALESCE(
  (
    SELECT CASE ral.action
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'suspended' THEN 'suspended'
      WHEN 'deactivated' THEN 'deactivated'
      WHEN 'reactivated' THEN 'approved'
      ELSE NULL
    END
    FROM "rj_approval_logs" ral
    WHERE ral.rj_user_id = rp.user_id
    ORDER BY ral.created_at DESC
    LIMIT 1
  ),
  CASE
    WHEN rp.is_approved AND rp.is_active THEN 'approved'
    WHEN rp.is_approved AND NOT rp.is_active THEN 'suspended'
    ELSE 'pending'
  END
);
