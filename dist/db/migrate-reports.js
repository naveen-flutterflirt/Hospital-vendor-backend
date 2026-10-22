import { db, pool } from '../config/db.js';
export async function migrateReportsTables() {
    console.log('📊 [PostgreSQL Migration]: Starting reports module migration...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        // 1. Extend reports table
        await db.query(`
      ALTER TABLE reports 
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS format VARCHAR(10) DEFAULT 'PDF',
      ADD COLUMN IF NOT EXISTS parameters JSONB,
      ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Ready',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
      CREATE INDEX IF NOT EXISTS idx_reports_code ON reports(report_code);
    `);
        console.log('✅ reports table extended.');
        // 2. Create scheduled_reports table
        await db.query(`
      CREATE TABLE IF NOT EXISTS scheduled_reports (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          template_name VARCHAR(150) NOT NULL,
          module VARCHAR(100) NOT NULL,
          frequency VARCHAR(50) NOT NULL,
          delivery_time VARCHAR(20) DEFAULT '08:00',
          recipients TEXT[] NOT NULL,
          format VARCHAR(10) DEFAULT 'PDF',
          attach_file BOOLEAN DEFAULT TRUE,
          is_active BOOLEAN DEFAULT TRUE,
          last_run_at TIMESTAMP WITH TIME ZONE,
          next_run_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 day',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active);
      CREATE INDEX IF NOT EXISTS idx_scheduled_reports_user ON scheduled_reports(user_id);
    `);
        console.log('✅ scheduled_reports table created.');
        // 3. Ensure sample reports exist
        const countRes = await db.query('SELECT COUNT(*) FROM reports');
        if (parseInt(countRes.rows[0].count) === 0) {
            await db.query(`
        INSERT INTO reports (report_code, name, report_type, file_size, generated_date, download_url, format, status)
        VALUES 
          ('RPT-8442', 'Q3 Vendor Performance Analysis', 'Vendor Management', '2.4 MB', 'Oct 08, 2026', '/api/v1/reports/download/RPT-8442', 'PDF', 'Ready'),
          ('RPT-8441', 'Monthly Inventory Valuation', 'Inventory', '1.1 MB', 'Oct 01, 2026', '/api/v1/reports/download/RPT-8441', 'CSV', 'Ready'),
          ('RPT-8440', 'AP Aging Summary', 'Finance', '840 KB', 'Sep 30, 2026', '/api/v1/reports/download/RPT-8440', 'PDF', 'Ready'),
          ('RPT-8439', 'Departmental Consumption Rate', 'Analytics', '3.2 MB', 'Sep 28, 2026', '/api/v1/reports/download/RPT-8439', 'CSV', 'Ready'),
          ('RPT-8438', 'AMC Expiry Forecast (Q4)', 'Assets', '1.5 MB', 'Sep 25, 2026', '/api/v1/reports/download/RPT-8438', 'PDF', 'Ready');
      `);
            console.log('🌱 Seeded default hospital reports.');
        }
        console.log('🚀 [PostgreSQL Migration]: Reports tables and indexes ready!');
    }
    catch (error) {
        console.error('❌ [PostgreSQL Migration Failed]:', error);
        throw error;
    }
}
migrateReportsTables()
    .then(async () => {
    await pool.end();
    process.exit(0);
})
    .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
});
