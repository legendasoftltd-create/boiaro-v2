import postgres from 'postgres';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// --- CONFIGURATION ---
// Supabase Project Settings > Database theke connection string nin.
// Password-er jaygay apnar real password din.
const connectionString = 'postgres://postgres.[wdewokhyhbsiprdlbenl]:[rakibmolla1@]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sql = postgres(connectionString, {
  ssl: 'require',
  max: 1 // Eksathe ektai connection use kora safe
});

async function runMigrations() {
  const migrationsDir = './supabase/migrations';
  
  try {
    // 1. Sob file-er list niye timestamp onujayi sort kora
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`🚀 Found ${files.length} migration files. Starting...`);

    // 2. Protiti file ekta ekta kore run kora
    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const content = readFileSync(filePath, 'utf8');

      console.log(`⏳ Running: ${file}`);
      
      // SQL execute kora (transaction use kora uchit jeno error asle roll back hoy)
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
      });
      
      console.log(`✅ Success: ${file}`);
    }

    console.log('\n🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED!');
    console.error(error);
  } finally {
    await sql.end();
    process.exit();
  }
}

runMigrations();