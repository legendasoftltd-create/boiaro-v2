-- Itemized record of which broadcaster-terms clauses an RJ accepted,
-- alongside the existing single terms_accepted_version/at fields.
ALTER TABLE "rj_profiles" ADD COLUMN "terms_accepted_clauses" JSONB;
