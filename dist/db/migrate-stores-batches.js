import { db } from '../config/db.js';
export async function migrateStoresAndBatches() {
    console.log('🔄 Starting migration for Stores & Batches distribution...');
    // 1. Ensure stores table exists and has all 6 standard hospital stores
    await db.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      branch VARCHAR(100) NOT NULL,
      store_type VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
    const initialStores = [
        { code: 'STR-CENTRAL', name: 'Central Warehouse & Main Drug Store', branch: 'Main Campus', type: 'Central' },
        { code: 'STR-PHARMA', name: 'Apex Pharmacy & Cold Chain Store', branch: 'Block A', type: 'Pharmacy' },
        { code: 'STR-ICU', name: 'ICU Sub-Store & Emergency Stock', branch: 'Trauma Wing', type: 'ICU' },
        { code: 'STR-OT', name: 'OT & Critical Care Sub-Store', branch: 'Surgical Block', type: 'OT' },
        { code: 'STR-WARDS', name: 'General Wards Dispensing Store', branch: 'Inpatient Tower', type: 'Wards' },
        { code: 'STR-EMG', name: 'Emergency & Trauma Triage Store', branch: 'Ground Floor ER', type: 'Emergency' },
    ];
    for (const st of initialStores) {
        await db.query(`INSERT INTO stores (code, name, branch, store_type, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (code) DO UPDATE 
       SET name = EXCLUDED.name, branch = EXCLUDED.branch, store_type = EXCLUDED.store_type;`, [st.code, st.name, st.branch, st.type]);
    }
    // 2. Map existing batches to corresponding store_id based on bin_location
    await db.query(`
    UPDATE batches SET store_id = 1 WHERE bin_location ILIKE '%central%';
    UPDATE batches SET store_id = 2 WHERE bin_location ILIKE '%pharmacy%' OR bin_location ILIKE '%apex%';
    UPDATE batches SET store_id = 3 WHERE bin_location ILIKE '%icu%';
    UPDATE batches SET store_id = 4 WHERE bin_location ILIKE '%ot%';
    UPDATE batches SET store_id = 5 WHERE bin_location ILIKE '%ward%';
    UPDATE batches SET store_id = 6 WHERE bin_location ILIKE '%emerg%';
    UPDATE batches SET store_id = 1 WHERE store_id IS NULL;
  `);
    // 3. Ensure Apex Pharmacy (store_id = 2) and OT Store (store_id = 4) have some dedicated high-value batches
    const apexCheck = await db.query(`SELECT COUNT(*) as count FROM batches WHERE store_id = 2;`);
    if (parseInt(apexCheck.rows[0].count, 10) < 5) {
        const itemsRes = await db.query(`SELECT id, item_code, name FROM items LIMIT 6;`);
        for (const item of itemsRes.rows) {
            await db.query(`
        INSERT INTO batches (
          item_id, batch_number, store_id, bin_location, quantity, 
          expiry_date, mrp, purchase_rate, status, vendor_name
        ) VALUES ($1, $2, 2, 'Apex Pharmacy · R1-A2', 250, 'Dec 2026', 150.00, 95.00, 'Issue first', 'Apex Pharma Supply')
        ON CONFLICT DO NOTHING;
      `, [item.id, `APX-${item.item_code.slice(-3)}-26A`]);
        }
    }
    const otCheck = await db.query(`SELECT COUNT(*) as count FROM batches WHERE store_id = 4;`);
    if (parseInt(otCheck.rows[0].count, 10) < 4) {
        const itemsRes = await db.query(`SELECT id, item_code, name FROM items WHERE category IN ('Consumables', 'Implants') LIMIT 4;`);
        for (const item of itemsRes.rows) {
            await db.query(`
        INSERT INTO batches (
          item_id, batch_number, store_id, bin_location, quantity, 
          expiry_date, mrp, purchase_rate, status, vendor_name
        ) VALUES ($1, $2, 4, 'OT Store · Rack-B', 80, 'Oct 2027', 450.00, 320.00, 'Available', 'MedTech Solutions')
        ON CONFLICT DO NOTHING;
      `, [item.id, `OT-${item.item_code.slice(-3)}-27`]);
        }
    }
    console.log('✅ Stores & Batches migration successfully applied.');
}
if (process.argv[1]?.endsWith('migrate-stores-batches.ts')) {
    migrateStoresAndBatches()
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
