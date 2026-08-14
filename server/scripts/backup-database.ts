// Manual one-off backup run: `npm run backup:db`. The nightly automated
// version of this is registered as a cron job in jobs/index.ts — both call
// the same runDatabaseBackup() so there's one implementation to keep correct.
import "dotenv/config";
import { runDatabaseBackup } from "../src/jobs/databaseBackup.js";

runDatabaseBackup()
  .then((r) => {
    console.log(`[backup] uploaded ${r.key} (${(r.sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`[backup] ${r.deletedExpired} expired backup(s) cleaned up`);
  })
  .catch((err) => {
    console.error("[backup] failed:", err);
    process.exit(1);
  });
