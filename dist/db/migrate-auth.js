import { db, pool } from '../config/db.js';
export async function migrateAuthTables() {
    console.log('🔒 [PostgreSQL Migration]: Creating revoked_tokens and audit_logs tables...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        await db.query(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
          id SERIAL PRIMARY KEY,
          token_hash VARCHAR(64) UNIQUE NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          reason VARCHAR(100) DEFAULT 'USER_LOGOUT',
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry ON revoked_tokens(expires_at);

      CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(100) NOT NULL,
          ip_address VARCHAR(100),
          user_agent TEXT,
          details JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    `);
        console.log('✅ [PostgreSQL Migration]: revoked_tokens & audit_logs tables created successfully!');
    }
    catch (error) {
        console.error('❌ [PostgreSQL Migration Failed]:', error);
        throw error;
    }
}
migrateAuthTables()
    .then(async () => {
    await pool.end();
    process.exit(0);
})
    .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
});
