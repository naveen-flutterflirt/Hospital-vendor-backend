import { db, pool } from '../config/db.js';
export async function migrateSettingsTables() {
    console.log('⚙️ [PostgreSQL Migration]: Starting settings module migration...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        // 1. Extend users table
        await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(64),
      ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
        console.log('✅ users table extended with security and profile columns.');
        // 2. Active Sessions Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          token_hash VARCHAR(64) UNIQUE NOT NULL,
          device_info VARCHAR(255) DEFAULT 'Chrome on macOS (Clinical Workstation)',
          ip_address VARCHAR(100) DEFAULT '192.168.1.104',
          user_agent TEXT,
          is_current BOOLEAN DEFAULT FALSE,
          last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    `);
        console.log('✅ user_sessions table created.');
        // 3. Approval Workflows Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS approval_workflows (
          id SERIAL PRIMARY KEY,
          level_name VARCHAR(100) NOT NULL,
          approver_role VARCHAR(100) NOT NULL,
          threshold_amount NUMERIC(14, 2) NOT NULL,
          auto_approve_below BOOLEAN DEFAULT FALSE,
          requires_quotations INTEGER DEFAULT 3,
          is_active BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ approval_workflows table created.');
        // Seed default approval workflows if empty
        const existingWorkflows = await db.query('SELECT COUNT(*) FROM approval_workflows');
        if (parseInt(existingWorkflows.rows[0].count) === 0) {
            await db.query(`
        INSERT INTO approval_workflows (level_name, approver_role, threshold_amount, auto_approve_below, requires_quotations)
        VALUES 
          ('Level 1: Department Head', 'Department Head', 50000.00, true, 1),
          ('Level 2: Finance Director / CPO', 'Chief Procurement Officer', 200000.00, false, 3),
          ('Level 3: Board of Directors / CMO', 'Chief Medical Officer', 1000000.00, false, 5);
      `);
            console.log('🌱 Seeded default 3-tier approval workflows.');
        }
        // 4. Notification Preferences Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          stockout_email BOOLEAN DEFAULT TRUE,
          stockout_sms BOOLEAN DEFAULT FALSE,
          stockout_in_app BOOLEAN DEFAULT TRUE,
          expiry_30_days BOOLEAN DEFAULT TRUE,
          expiry_60_days BOOLEAN DEFAULT TRUE,
          expiry_90_days BOOLEAN DEFAULT FALSE,
          grn_discrepancy_alert BOOLEAN DEFAULT TRUE,
          po_approval_required BOOLEAN DEFAULT TRUE,
          weekly_digest_email BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_user_notification UNIQUE(user_id)
      );
    `);
        console.log('✅ notification_preferences table created.');
        // Seed default notification preferences for all existing users
        await db.query(`
      INSERT INTO notification_preferences (user_id)
      SELECT id FROM users
      ON CONFLICT (user_id) DO NOTHING;
    `);
        console.log('🌱 Seeded default notification preferences for existing users.');
        // 5. System Integrations Table
        await db.query(`
      CREATE TABLE IF NOT EXISTS system_integrations (
          id SERIAL PRIMARY KEY,
          integration_key VARCHAR(100) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          endpoint_url TEXT,
          secret_key_masked VARCHAR(100),
          is_enabled BOOLEAN DEFAULT FALSE,
          last_sync_status VARCHAR(50) DEFAULT 'Healthy',
          last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ system_integrations table created.');
        // Seed default integrations if empty
        const existingIntegrations = await db.query('SELECT COUNT(*) FROM system_integrations');
        if (parseInt(existingIntegrations.rows[0].count) === 0) {
            await db.query(`
        INSERT INTO system_integrations (integration_key, name, endpoint_url, secret_key_masked, is_enabled, last_sync_status)
        VALUES 
          ('hmis_fhir', 'Hospital HIS / FHIR Core R4', 'https://his.hospital.internal/fhir/v4', '••••••••••••8a92', true, 'Healthy'),
          ('vendor_edi', 'Vendor EDI & Automated PO Gateway', 'https://edi.medsupplies.net/api/v2/po', '••••••••••••bc34', true, 'Healthy'),
          ('iot_cold_chain', 'Cold-Chain IoT Refrigerator Telemetry', 'https://iot.hospital.internal/webhooks/coldchain', '••••••••••••4f11', true, 'Healthy');
      `);
            console.log('🌱 Seeded default system integrations.');
        }
        console.log('🚀 [PostgreSQL Migration]: All settings tables created and seeded successfully!');
    }
    catch (error) {
        console.error('❌ [PostgreSQL Migration Failed]:', error);
        throw error;
    }
}
migrateSettingsTables()
    .then(async () => {
    await pool.end();
    process.exit(0);
})
    .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
});
