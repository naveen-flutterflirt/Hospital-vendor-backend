import { db, pool } from '../config/db.js';

export async function migrateAssetsModule() {
  console.log('🏥 [PostgreSQL Migration]: Starting Assets & AMC module migration...');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
    }

    // 1. Extend assets table with AMC and tracking columns
    await db.query(`
      ALTER TABLE assets 
      ADD COLUMN IF NOT EXISTS amc_start_date DATE,
      ADD COLUMN IF NOT EXISTS amc_end_date DATE,
      ADD COLUMN IF NOT EXISTS modality VARCHAR(100) DEFAULT 'General Diagnostic',
      ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT 'Main Campus',
      ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT '2024-01-15',
      ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT TRUE;

      CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
      CREATE INDEX IF NOT EXISTS idx_assets_dept ON assets(department);
      CREATE INDEX IF NOT EXISTS idx_assets_amc_end ON assets(amc_end_date);
    `);
    console.log('✅ assets table extended with contract columns and indexes.');

    // 2. Create asset_maintenance_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
          id SERIAL PRIMARY KEY,
          ticket_number VARCHAR(50) UNIQUE NOT NULL,
          asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
          maintenance_type VARCHAR(50) NOT NULL, -- 'preventive', 'breakdown', 'calibration', 'safety_audit'
          service_date DATE NOT NULL DEFAULT CURRENT_DATE,
          technician_name VARCHAR(255) DEFAULT 'Senior Bio-Medical Engineer',
          vendor_name VARCHAR(255),
          cost NUMERIC(12, 2) DEFAULT 0.00,
          issue_description TEXT,
          resolution_notes TEXT,
          downtime_hours NUMERIC(6, 1) DEFAULT 0.0,
          status VARCHAR(50) DEFAULT 'Open', -- 'Open', 'In Progress', 'Resolved', 'Closed'
          created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_maint_asset_id ON asset_maintenance_logs(asset_id);
      CREATE INDEX IF NOT EXISTS idx_maint_status ON asset_maintenance_logs(status);
    `);
    console.log('✅ asset_maintenance_logs table created.');

    // 3. Populate 45 comprehensive capital equipment records matching the UI
    const departments = ['Radiology', 'ICU', 'Operation Theatre', 'Pathology Lab', 'Cardiology'];
    const vendors = [
      'Apex Medical Systems',
      'Siemens Healthineers',
      'Philips Healthcare',
      'GE Medical Systems',
      'Nova MedEquip Traders',
    ];
    const equipmentCatalog = [
      { name: 'MRI Scanner 3T', baseCost: 8500000, dept: 'Radiology', vendor: 'Apex Medical Systems', sn: 'SN-00000000' },
      { name: 'Ventilator V60', baseCost: 1450000, dept: 'ICU', vendor: 'Siemens Healthineers', sn: 'SN-0012D687' },
      { name: 'Surgical Table Pro', baseCost: 920000, dept: 'Operation Theatre', vendor: 'Philips Healthcare', sn: 'SN-0025AD0E' },
      { name: 'Hematology Analyzer', baseCost: 1850000, dept: 'Pathology Lab', vendor: 'GE Medical Systems', sn: 'SN-00388395' },
      { name: 'ECG Machine 12-lead', baseCost: 420000, dept: 'Cardiology', vendor: 'Nova MedEquip Traders', sn: 'SN-004B5A1C' },
    ];

    // Clear existing assets to ensure clean dataset of 45 items
    await db.query('TRUNCATE asset_maintenance_logs CASCADE');
    await db.query('DELETE FROM assets');

    console.log('🌱 Seeding 45 hospital capital assets...');

    for (let i = 0; i < 45; i++) {
      const template = equipmentCatalog[i % equipmentCatalog.length];
      const dept = departments[i % departments.length];
      const vendor = vendors[i % vendors.length];
      const assetTag = `AST-24-${1000 + i}`;
      const assetName = i < 5 ? template.name : `${template.name} (Unit ${Math.floor(i / 5) + 1})`;
      const serialNo = i < 5 ? template.sn : `SN-${(i * 1234567).toString(16).padStart(8, '0').toUpperCase()}`;

      // Status distribution: 14 in maintenance/breakdown, 2 out of service, rest active
      let status = 'Active';
      if (i === 0 || i % 3 === 0 && i < 30) {
        status = 'In Maintenance';
      } else if (i === 19 || i === 39) {
        status = 'Out of Service';
      }

      // AMC Expiry calculation:
      // i === 0: Expires in 1 day (matches screenshot!)
      // Some expiring soon (< 30 days) to trigger amc_alert
      let daysRemaining = (i * 14) % 180 + 30;
      let amcAlert = false;
      let amcExpiryText = `Valid for ${daysRemaining} days`;

      if (i === 0) {
        daysRemaining = 1;
        amcAlert = true;
        amcExpiryText = 'Expires in 1 days';
      } else if (i % 8 === 0) {
        daysRemaining = (i % 5) + 1;
        amcAlert = true;
        amcExpiryText = `Expires in ${daysRemaining} days`;
      } else if (i === 1) {
        daysRemaining = 44;
        amcExpiryText = 'Valid for 44 days';
      } else if (i === 2) {
        daysRemaining = 58;
        amcExpiryText = 'Valid for 58 days';
      } else if (i === 3) {
        daysRemaining = 72;
        amcExpiryText = 'Valid for 72 days';
      } else if (i === 4) {
        daysRemaining = 86;
        amcExpiryText = 'Valid for 86 days';
      }

      const cost = template.baseCost + (i * 50000);

      const insertAsset = await db.query(
        `INSERT INTO assets (
            asset_tag, name, serial_no, department, vendor_name, 
            amc_expiry, amc_alert, status, purchase_cost,
            amc_start_date, amc_end_date, purchase_date
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE - INTERVAL '180 days', CURRENT_DATE + ($10 || ' days')::INTERVAL, CURRENT_DATE - INTERVAL '365 days')
         RETURNING id`,
        [assetTag, assetName, serialNo, dept, vendor, amcExpiryText, amcAlert, status, cost, daysRemaining]
      );

      // 4. Seed maintenance logs for assets that are 'In Maintenance'
      if (status === 'In Maintenance') {
        const ticketNum = `TKT-${8840 + i}`;
        const maintType = i % 2 === 0 ? 'breakdown' : 'preventive';
        const desc = maintType === 'breakdown'
          ? 'Emergency hardware sensor calibration failure and thermal error.'
          : 'Quarterly scheduled preventive maintenance inspection.';

        await db.query(
          `INSERT INTO asset_maintenance_logs (
              ticket_number, asset_id, maintenance_type, service_date,
              technician_name, vendor_name, cost, issue_description, status
           )
           VALUES ($1, $2, $3, CURRENT_DATE, 'Senior Bio-Medical Engineer', $4, $5, $6, 'Open')`,
          [ticketNum, insertAsset.rows[0].id, maintType, vendor, 25000 + (i * 1200), desc]
        );
      }
    }

    console.log('✅ 45 capital assets and open maintenance logs seeded successfully.');
  } catch (error) {
    console.error('❌ [Assets Migration Failed]:', error);
    throw error;
  }
}

// If run directly
if (process.argv[1] && (process.argv[1].endsWith('migrate-assets.ts') || process.argv[1].endsWith('migrate-assets.js'))) {
  migrateAssetsModule()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
