-- Hardcopy can never be part of a subscription. Clean up any stale rows and
-- add a defense-in-depth DB constraint on top of the application-layer guard
-- in the admin/creator mutations. This constraint is unmanaged by Prisma's
-- schema DSL (no @@check attribute) — it's a backstop, not the primary
-- enforcement point, and can be dropped later without weakening security
-- since the application layer and access engine both also enforce this.
UPDATE "book_formats" SET "subscriber_access" = false WHERE "format" = 'hardcopy' AND "subscriber_access" = true;

ALTER TABLE "book_formats"
  ADD CONSTRAINT "hardcopy_never_subscriber_access"
  CHECK ("format" <> 'hardcopy' OR "subscriber_access" IS NOT TRUE);
