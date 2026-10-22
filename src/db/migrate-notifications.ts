import { db, pool } from '../config/db.js';

export async function migrateNotificationsTable() {
  console.log('🔔 [PostgreSQL Migration]: Starting notifications module migration...');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
    }

    // 1. Create notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(50) DEFAULT 'info',
          category VARCHAR(50) DEFAULT 'system',
          link VARCHAR(255),
          is_read BOOLEAN DEFAULT FALSE,
          read_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
    `);
    console.log('✅ notifications table and indexes created.');

    // 2. Ensure initial seed notifications exist
    const countRes = await db.query('SELECT COUNT(*) FROM notifications');
    if (parseInt(countRes.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read, created_at)
        VALUES 
          (
            'ICU Buffer Stockout Alert',
            'Meropenem 1g Inj fell below safety threshold (8 vials left in ICU store). Immediate re-order recommended.',
            'critical',
            'inventory',
            '/items',
            false,
            CURRENT_TIMESTAMP - INTERVAL '12 minutes'
          ),
          (
            'PO Authorization Required',
            'PR-2026-089 (₹1.85L) awaiting CPO digital signature approval for emergency surgical sutures.',
            'warning',
            'procurement',
            '/purchase-orders',
            false,
            CURRENT_TIMESTAMP - INTERVAL '45 minutes'
          ),
          (
            'GRN Inspection Released',
            'Batch #B-9021 passed cold-chain assay and quarantine release into Central Pharmacy formulary.',
            'success',
            'quality',
            '/grn-qc',
            false,
            CURRENT_TIMESTAMP - INTERVAL '2 hours'
          ),
          (
            'Cold-Chain Telemetry Stable',
            'Main biological vaccine refrigerator telemetry verified stable at 3.8°C with zero drift.',
            'info',
            'telemetry',
            '/assets-amc',
            true,
            CURRENT_TIMESTAMP - INTERVAL '4 hours'
          ),
          (
            'AMC Expiry Notice',
            'Siemens Multislice CT-Scan AMC maintenance expiring in 14 days. Review vendor contract terms.',
            'warning',
            'quality',
            '/assets-amc',
            false,
            CURRENT_TIMESTAMP - INTERVAL '1 day'
          ),
          (
            'Invoice Matched & Processed',
            'Invoice #INV-2026-441 (₹84,200) 3-way matched with PO-2026-104 and GRN-7049 for payment.',
            'success',
            'procurement',
            '/invoices-payments',
            true,
            CURRENT_TIMESTAMP - INTERVAL '2 days'
          );
      `);
      console.log('✅ Default hospital notifications seeded.');
    }
  } catch (error) {
    console.error('❌ [Notifications Migration Failed]:', error);
    throw error;
  }
}

// Run directly if invoked
if (process.argv[1] && (process.argv[1].endsWith('migrate-notifications.ts') || process.argv[1].endsWith('migrate-notifications.js'))) {
  migrateNotificationsTable()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
