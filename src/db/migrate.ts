import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🚀 [PostgreSQL Migration]: Starting schema migration...');
  
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
    }
    console.log(` Connected to PostgreSQL database: "${conn.database}"`);

    // Execute schema statements
    await db.query(sql);
    console.log('✅ [PostgreSQL Migration]: Schema applied successfully! All 16+ tables created.');
  } catch (error) {
    console.error('❌ [PostgreSQL Migration Failed]:', error);
    throw error;
  }
}

// If run directly via `npm run db:migrate` or compiled `node dist/db/migrate.js`
if (process.argv[1] && (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'))) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
