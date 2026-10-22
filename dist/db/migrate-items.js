import { db } from '../config/db.js';
export async function migrateItems() {
    console.log('📦 [PostgreSQL Migration]: Starting Items & Batches module migration...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        // 1. Upgrade items table schema if needed
        await db.query(`
      ALTER TABLE items 
      ADD COLUMN IF NOT EXISTS generic_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS form VARCHAR(100) DEFAULT 'vial',
      ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(50) DEFAULT '3004',
      ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 12.00,
      ADD COLUMN IF NOT EXISTS class_vital VARCHAR(50) DEFAULT 'Vital · A-class',
      ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(50) DEFAULT 'Schedule H',
      ADD COLUMN IF NOT EXISTS is_patient_chargeable BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS avg_daily_use NUMERIC(10,2) DEFAULT 45.00,
      ADD COLUMN IF NOT EXISTS target_cover_days NUMERIC(10,2) DEFAULT 30.00,
      ADD COLUMN IF NOT EXISTS rate_contract_expiry VARCHAR(50) DEFAULT 'Rate contract to Mar-27';

      CREATE INDEX IF NOT EXISTS idx_items_code ON items(item_code);
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    `);
        // 2. Upgrade batches table schema
        await db.query(`
      ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255) DEFAULT 'Aarogya Pharma',
      ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2) DEFAULT 62.00,
      ADD COLUMN IF NOT EXISTS purchase_rate NUMERIC(12,2) DEFAULT 38.40,
      ADD COLUMN IF NOT EXISTS bin_location VARCHAR(100) DEFAULT 'Central Store · A1-01',
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';

      CREATE INDEX IF NOT EXISTS idx_batches_item_id ON batches(item_id);
      CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
    `);
        console.log('✅ Items & Batches schema verified & upgraded.');
        // 3. Seed rich hospital formulary catalog if fewer than 10 items
        const countRes = await db.query('SELECT count(*) FROM items');
        const existingCount = parseInt(countRes.rows[0].count, 10);
        console.log(`ℹ️ Existing items count in DB: ${existingCount}`);
        if (existingCount < 10) {
            console.log('🌱 Seeding rich formulary items...');
            const newItems = [
                {
                    item_code: 'DRG-00201',
                    name: 'Inj. Noradrenaline 4mg',
                    generic_name: 'Norepinephrine bitartrate',
                    category: 'Pharmacy',
                    form: 'ampoule',
                    hsn_code: '3004',
                    gst_rate: 12.0,
                    uom: 'ampoule (box of 5)',
                    class_vital: 'Vital · A-class',
                    schedule_type: 'Schedule H',
                    is_patient_chargeable: true,
                    total_on_hand: 920,
                    avg_daily_use: 32,
                    target_cover_days: 28,
                    reorder_level: 400,
                    reorder_qty: 1000,
                    last_rate: 165.0,
                    rate_contract_expiry: 'Rate contract to Dec-26',
                },
                {
                    item_code: 'DRG-00330',
                    name: 'Inj. Piperacillin + Tazobactam 4.5 g',
                    generic_name: 'Piperacillin sodium + Tazobactam',
                    category: 'Pharmacy',
                    form: 'vial',
                    hsn_code: '3004',
                    gst_rate: 12.0,
                    uom: 'vial',
                    class_vital: 'Vital · A-class',
                    schedule_type: 'Schedule H',
                    is_patient_chargeable: true,
                    total_on_hand: 1450,
                    avg_daily_use: 65,
                    target_cover_days: 22,
                    reorder_level: 600,
                    reorder_qty: 1500,
                    last_rate: 340.0,
                    rate_contract_expiry: 'Rate contract to Feb-27',
                },
                {
                    item_code: 'CON-00331',
                    name: 'IV Cannula 20G Pink with Port',
                    generic_name: 'PTFE intravenous safety cannula',
                    category: 'Consumables',
                    form: 'unit',
                    hsn_code: '9018',
                    gst_rate: 12.0,
                    uom: 'box of 100 pcs',
                    class_vital: 'Essential · B-class',
                    schedule_type: 'Non-Scheduled',
                    is_patient_chargeable: true,
                    total_on_hand: 5400,
                    avg_daily_use: 180,
                    target_cover_days: 30,
                    reorder_level: 2000,
                    reorder_qty: 5000,
                    last_rate: 14.5,
                    rate_contract_expiry: 'Rate contract to Jan-27',
                },
                {
                    item_code: 'CON-00445',
                    name: 'Disposable Syringe 5ml with Needle',
                    generic_name: 'Sterile 3-part syringe with luer lock',
                    category: 'Consumables',
                    form: 'unit',
                    hsn_code: '9018',
                    gst_rate: 12.0,
                    uom: 'box of 100 pcs',
                    class_vital: 'Essential · B-class',
                    schedule_type: 'Non-Scheduled',
                    is_patient_chargeable: true,
                    total_on_hand: 12800,
                    avg_daily_use: 420,
                    target_cover_days: 30,
                    reorder_level: 4000,
                    reorder_qty: 10000,
                    last_rate: 3.8,
                    rate_contract_expiry: 'Rate contract to Jun-27',
                },
                {
                    item_code: 'IMP-00318',
                    name: 'Drug Eluting Coronary Stent 3.0 x 24mm',
                    generic_name: 'Everolimus-eluting cobalt chromium stent',
                    category: 'Implants',
                    form: 'sterile pack',
                    hsn_code: '9021',
                    gst_rate: 5.0,
                    uom: 'unit',
                    class_vital: 'Vital · A-class',
                    schedule_type: 'Critical Implant',
                    is_patient_chargeable: true,
                    total_on_hand: 48,
                    avg_daily_use: 2,
                    target_cover_days: 24,
                    reorder_level: 20,
                    reorder_qty: 50,
                    last_rate: 28500.0,
                    rate_contract_expiry: 'Rate contract to Oct-26',
                },
                {
                    item_code: 'LAB-00120',
                    name: 'ABG Cartridge with Co-oximetry',
                    generic_name: 'Arterial blood gas test cassette',
                    category: 'Lab Supplies',
                    form: 'cartridge pack',
                    hsn_code: '3822',
                    gst_rate: 18.0,
                    uom: 'pack of 25',
                    class_vital: 'Vital · A-class',
                    schedule_type: 'In-Vitro Diagnostic',
                    is_patient_chargeable: true,
                    total_on_hand: 380,
                    avg_daily_use: 15,
                    target_cover_days: 25,
                    reorder_level: 150,
                    reorder_qty: 400,
                    last_rate: 420.0,
                    rate_contract_expiry: 'Rate contract to Apr-27',
                },
                {
                    item_code: 'RAD-00502',
                    name: 'Omnipaque 350 mg I/ml 100 ml',
                    generic_name: 'Iohexol non-ionic iodinated contrast',
                    category: 'Radiology',
                    form: 'vial',
                    hsn_code: '3006',
                    gst_rate: 12.0,
                    uom: 'vial',
                    class_vital: 'Vital · A-class',
                    schedule_type: 'Schedule H',
                    is_patient_chargeable: true,
                    total_on_hand: 320,
                    avg_daily_use: 12,
                    target_cover_days: 26,
                    reorder_level: 120,
                    reorder_qty: 300,
                    last_rate: 1850.0,
                    rate_contract_expiry: 'Rate contract to Nov-26',
                },
            ];
            for (const it of newItems) {
                await db.query(`
          INSERT INTO items (
            item_code, name, generic_name, category, form, hsn_code, gst_rate, uom,
            class_vital, schedule_type, is_patient_chargeable, total_on_hand, avg_daily_use,
            target_cover_days, reorder_level, reorder_qty, last_rate, rate_contract_expiry,
            is_active, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          ) ON CONFLICT DO NOTHING;
        `, [
                    it.item_code, it.name, it.generic_name, it.category, it.form, it.hsn_code, it.gst_rate,
                    it.uom, it.class_vital, it.schedule_type, it.is_patient_chargeable, it.total_on_hand,
                    it.avg_daily_use, it.target_cover_days, it.reorder_level, it.reorder_qty, it.last_rate,
                    it.rate_contract_expiry,
                ]);
            }
            console.log('✅ Formulary items seeded.');
        }
        // 4. Ensure realistic batches exist for all items
        const allItems = await db.query('SELECT id, item_code, name, last_rate FROM items');
        for (const item of allItems.rows) {
            const bCheck = await db.query('SELECT count(*) FROM batches WHERE item_id = $1', [item.id]);
            const bCount = parseInt(bCheck.rows[0].count, 10);
            if (bCount === 0) {
                const rate = parseFloat(item.last_rate || '45');
                const mrp = rate * 1.45;
                const codePrefix = item.item_code.split('-')[1] || '99';
                const sampleBatches = [
                    {
                        batch_number: `BAT-${codePrefix}-24A`,
                        bin_location: 'IP Pharmacy · R2-B4',
                        quantity: Math.floor(rate > 1000 ? 15 : 120),
                        expiry_date: 'Dec 2026',
                        mrp: mrp.toFixed(2),
                        purchase_rate: rate.toFixed(2),
                        vendor_name: 'Aarogya Healthcare',
                        status: 'Near expiry',
                    },
                    {
                        batch_number: `BAT-${codePrefix}-25C`,
                        bin_location: 'ICU sub-store',
                        quantity: Math.floor(rate > 1000 ? 25 : 350),
                        expiry_date: 'Feb 2027',
                        mrp: mrp.toFixed(2),
                        purchase_rate: rate.toFixed(2),
                        vendor_name: 'Shreeram Distributors',
                        status: 'Issue first',
                    },
                    {
                        batch_number: `BAT-${codePrefix}-25F`,
                        bin_location: 'Central Store · A1-03',
                        quantity: Math.floor(rate > 1000 ? 50 : 1200),
                        expiry_date: 'May 2027',
                        mrp: (mrp * 1.05).toFixed(2),
                        purchase_rate: rate.toFixed(2),
                        vendor_name: 'Aarogya Healthcare',
                        status: 'Available',
                    },
                    {
                        batch_number: `BAT-${codePrefix}-25K`,
                        bin_location: 'Central · QC hold',
                        quantity: Math.floor(rate > 1000 ? 10 : 80),
                        expiry_date: 'Aug 2027',
                        mrp: (mrp * 1.05).toFixed(2),
                        purchase_rate: rate.toFixed(2),
                        vendor_name: 'MedSource Life Sciences',
                        status: 'QC pending',
                    },
                ];
                for (const b of sampleBatches) {
                    await db.query(`
            INSERT INTO batches (
              item_id, batch_number, bin_location, quantity, expiry_date, mrp, purchase_rate, vendor_name, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP);
          `, [
                        item.id, b.batch_number, b.bin_location, b.quantity, b.expiry_date, b.mrp, b.purchase_rate, b.vendor_name, b.status
                    ]);
                }
            }
        }
        console.log('✅ Batches verified for all formulary items.');
    }
    catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}
// Run immediately if called directly
if (process.argv[1]?.endsWith('migrate-items.ts')) {
    migrateItems()
        .then(() => {
        console.log('🎉 Items migration executed successfully.');
        process.exit(0);
    })
        .catch((err) => {
        console.error('💥 Fatal migration error:', err);
        process.exit(1);
    });
}
