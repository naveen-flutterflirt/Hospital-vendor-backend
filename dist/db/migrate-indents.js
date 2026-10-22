import { db } from '../config/db.js';
export async function migrateIndents() {
    console.log('🏥 [PostgreSQL Migration]: Starting Indents module migration...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        // 1. Upgrade indents table schema
        await db.query(`
      ALTER TABLE indents 
      ADD COLUMN IF NOT EXISTS to_store_name VARCHAR(100) DEFAULT 'IP Pharmacy',
      ADD COLUMN IF NOT EXISTS fulfilled_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS escalated_to_pr VARCHAR(50);

      CREATE INDEX IF NOT EXISTS idx_indents_status ON indents(status);
      CREATE INDEX IF NOT EXISTS idx_indents_dept ON indents(requesting_dept);
      CREATE INDEX IF NOT EXISTS idx_indents_priority ON indents(priority);
      CREATE INDEX IF NOT EXISTS idx_indents_created ON indents(created_at DESC);
    `);
        // 2. Upgrade indent_items table schema
        await db.query(`
      ALTER TABLE indent_items
      ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS item_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS uom VARCHAR(50) DEFAULT 'units';

      CREATE INDEX IF NOT EXISTS idx_indent_items_indent_id ON indent_items(indent_id);
    `);
        console.log('✅ Indents schema verified & updated.');
        // 3. Check existing indents count
        const countRes = await db.query('SELECT count(*) FROM indents');
        const existingCount = parseInt(countRes.rows[0].count, 10);
        console.log(`ℹ️ Existing indents count in DB: ${existingCount}`);
        // If fewer than 15 indents, seed realistic hospital ward indents
        if (existingCount < 15) {
            console.log('🌱 Seeding realistic hospital Indents and line items data...');
            // Fetch sample items to link
            const itemsRes = await db.query('SELECT id, item_code, name, uom FROM items LIMIT 12');
            const sampleItems = itemsRes.rows;
            const seedIndents = [
                {
                    indent_number: 'IND-24-1198',
                    requesting_dept: 'ICU',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Emergency',
                    status: 'Pending',
                    raised_by_name: 'Nurse R. Sharma',
                    notes: 'Urgent ICU replenishment post-cardiac surgery crash cart usage',
                    minsAgo: 15,
                },
                {
                    indent_number: 'IND-24-1197',
                    requesting_dept: 'Emergency Dept',
                    to_store_name: 'Central Store',
                    priority: 'Emergency',
                    status: 'Pending',
                    raised_by_name: 'Nurse K. Singh',
                    notes: 'Emergency polytrauma resuscitation fluids and cannula sets',
                    minsAgo: 32,
                },
                {
                    indent_number: 'IND-24-1196',
                    requesting_dept: 'OT 1',
                    to_store_name: 'Central Store',
                    priority: 'Urgent',
                    status: 'Processing',
                    raised_by_name: 'Dr. S. Patil',
                    notes: 'General surgery morning elective list consumables',
                    minsAgo: 50,
                },
                {
                    indent_number: 'IND-24-1195',
                    requesting_dept: 'Ward 3',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Routine',
                    status: 'Processing',
                    raised_by_name: 'Nurse A. Kumar',
                    notes: 'Post-op ward routine surgical dressings and antiseptic solution',
                    minsAgo: 75,
                },
                {
                    indent_number: 'IND-24-1194',
                    requesting_dept: 'Pediatrics',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Routine',
                    status: 'Partially Issued',
                    raised_by_name: 'Nurse M. Devi',
                    notes: 'Pediatric micro-drip infusion sets and 24G cannulas',
                    minsAgo: 120,
                },
                {
                    indent_number: 'IND-24-1193',
                    requesting_dept: 'Dialysis',
                    to_store_name: 'Central Store',
                    priority: 'Urgent',
                    status: 'Pending',
                    raised_by_name: 'Tech J. Thomas',
                    notes: 'Dialyzer acid concentrate cans and bicarbonate cartridges',
                    minsAgo: 145,
                },
                {
                    indent_number: 'IND-24-1192',
                    requesting_dept: 'Cardiology',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Emergency',
                    status: 'Pending',
                    raised_by_name: 'Nurse P. Nair',
                    notes: 'Cath lab emergency heparin flush vials and guide wire introducers',
                    minsAgo: 180,
                },
                {
                    indent_number: 'IND-24-1191',
                    requesting_dept: 'Maternity',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Routine',
                    status: 'Completed',
                    raised_by_name: 'Nurse S. Rekha',
                    notes: 'Labor room delivery pack consumables and oxytocin vials',
                    minsAgo: 240,
                    fulfilled_by: 'Pharmacist Priya V.',
                },
                {
                    indent_number: 'IND-24-1190',
                    requesting_dept: 'Ward 1',
                    to_store_name: 'Central Store',
                    priority: 'Routine',
                    status: 'Completed',
                    raised_by_name: 'Nurse K. Singh',
                    notes: 'Inpatient general medical ward daily consumable issue',
                    minsAgo: 310,
                    fulfilled_by: 'Store Officer Ravi M.',
                },
                {
                    indent_number: 'IND-24-1189',
                    requesting_dept: 'Oncology',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Urgent',
                    status: 'Pending',
                    raised_by_name: 'Dr. C. Chatterjee',
                    notes: 'Chemotherapy day-care anti-emetic premedication ampoules',
                    minsAgo: 380,
                },
                {
                    indent_number: 'IND-24-1188',
                    requesting_dept: 'Orthopedics',
                    to_store_name: 'Central Store',
                    priority: 'Routine',
                    status: 'Completed',
                    raised_by_name: 'Nurse R. Sharma',
                    notes: 'Plaster of Paris rolls and elastic crepe bandages',
                    minsAgo: 450,
                    fulfilled_by: 'Store Officer Ravi M.',
                },
                {
                    indent_number: 'IND-24-1187',
                    requesting_dept: 'ICU',
                    to_store_name: 'Central Store',
                    priority: 'Routine',
                    status: 'Completed',
                    raised_by_name: 'Nurse A. Kumar',
                    notes: 'Suction catheters, sterile gloves and arterial blood gas syringes',
                    minsAgo: 520,
                    fulfilled_by: 'Pharmacist Priya V.',
                },
                {
                    indent_number: 'IND-24-1186',
                    requesting_dept: 'OT 2',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Urgent',
                    status: 'Processing',
                    raised_by_name: 'Dr. S. Patil',
                    notes: 'Spinal anesthesia needles 25G and bupivacaine heavy ampoules',
                    minsAgo: 600,
                },
                {
                    indent_number: 'IND-24-1185',
                    requesting_dept: 'Emergency Dept',
                    to_store_name: 'IP Pharmacy',
                    priority: 'Emergency',
                    status: 'Completed',
                    raised_by_name: 'Nurse K. Singh',
                    notes: 'Tetanus toxoid injections and adrenaline ampoules',
                    minsAgo: 720,
                    fulfilled_by: 'Pharmacist Priya V.',
                },
                {
                    indent_number: 'IND-24-1184',
                    requesting_dept: 'Ward 2',
                    to_store_name: 'Central Store',
                    priority: 'Routine',
                    status: 'Completed',
                    raised_by_name: 'Nurse M. Devi',
                    notes: 'Disposable bed sheets and patient examination gloves',
                    minsAgo: 850,
                    fulfilled_by: 'Store Officer Ravi M.',
                },
            ];
            for (const ind of seedIndents) {
                const totalItemsCount = (ind.indent_number.charCodeAt(10) % 5) + 3;
                const insertRes = await db.query(`
          INSERT INTO indents (
            indent_number, requesting_dept, to_store_name, priority, status, 
            raised_by_name, notes, total_items_count, fulfilled_by, fulfilled_at, 
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::VARCHAR, 
            CASE WHEN $9::VARCHAR IS NOT NULL THEN CURRENT_TIMESTAMP - ($10::VARCHAR || ' minutes')::INTERVAL ELSE NULL END,
            CURRENT_TIMESTAMP - ($10::VARCHAR || ' minutes')::INTERVAL, CURRENT_TIMESTAMP
          )
          ON CONFLICT (indent_number) DO UPDATE SET
            requesting_dept = EXCLUDED.requesting_dept,
            to_store_name = EXCLUDED.to_store_name,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            fulfilled_by = EXCLUDED.fulfilled_by,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id;
        `, [
                    ind.indent_number,
                    ind.requesting_dept,
                    ind.to_store_name,
                    ind.priority,
                    ind.status,
                    ind.raised_by_name,
                    ind.notes,
                    totalItemsCount,
                    ind.fulfilled_by || null,
                    String(ind.minsAgo),
                ]);
                const indentId = insertRes.rows[0]?.id;
                // Insert line items for this indent
                if (indentId && sampleItems.length > 0) {
                    const checkItems = await db.query('SELECT count(*) FROM indent_items WHERE indent_id = $1', [indentId]);
                    if (parseInt(checkItems.rows[0].count, 10) === 0) {
                        const numLines = Math.min((ind.indent_number.charCodeAt(10) % 3) + 2, sampleItems.length);
                        for (let j = 0; j < numLines; j++) {
                            const it = sampleItems[(j + (ind.indent_number.charCodeAt(10) % 4)) % sampleItems.length];
                            const reqQty = (j + 1) * 15;
                            const issuedQty = ind.status === 'Completed' ? reqQty : ind.status === 'Partially Issued' ? Math.floor(reqQty / 2) : 0;
                            await db.query(`
                INSERT INTO indent_items (
                  indent_id, item_id, item_name, item_code, uom, requested_qty, issued_qty, remarks
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
              `, [
                                indentId,
                                it.id,
                                it.name,
                                it.item_code,
                                it.uom || 'units',
                                reqQty,
                                issuedQty,
                                ind.status === 'Completed' ? 'Fully issued from shelf stock' : 'Awaiting store pick',
                            ]);
                        }
                    }
                }
            }
            console.log('✅ Successfully seeded comprehensive Indents and line items!');
        }
    }
    catch (err) {
        console.error('❌ Failed to run indents migration:', err);
        throw err;
    }
}
// Auto-run if executed directly
if (process.argv[1]?.includes('migrate-indents')) {
    migrateIndents().then(() => {
        console.log('Indents migration finished.');
        process.exit(0);
    }).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
