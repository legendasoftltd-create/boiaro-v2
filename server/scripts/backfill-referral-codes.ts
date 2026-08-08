// One-time backfill: assigns a unique referral code to every profile that
// predates the referral feature (or was otherwise created without one).
// Safe to re-run — only touches rows where referral_code IS NULL.
import { prisma } from "../src/lib/prisma.js";
import { generateUniqueReferralCode } from "../src/lib/referralCode.js";

async function main() {
  const profiles = await prisma.profile.findMany({
    where: { referral_code: null },
    select: { user_id: true },
  });
  console.log(`Found ${profiles.length} profile(s) with no referral code.`);

  let updated = 0;
  for (const p of profiles) {
    const code = await generateUniqueReferralCode();
    await prisma.profile.update({ where: { user_id: p.user_id }, data: { referral_code: code } });
    updated++;
    if (updated % 100 === 0) console.log(`...${updated}/${profiles.length}`);
  }
  console.log(`Backfilled ${updated} profile(s).`);

  const remaining = await prisma.profile.count({ where: { referral_code: null } });
  console.log(`Remaining null referral_code rows: ${remaining}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
