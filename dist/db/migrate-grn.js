import { db, pool } from '../config/db.js';
export async function migrateGrn() {
    console.log('🚀 [GRN & QC Migration]: Upgrading database schema and seeding records...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Database connection failed: ${conn.error}`);
        }
        console.log(` Connected to database: "${conn.database}"`);
        // 1. Upgrade grns table
        await db.query(`
      ALTER TABLE grns
        ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(100),
        ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS expiry_date VARCHAR(50),
        ADD COLUMN IF NOT EXISTS temperature_celsius NUMERIC(4, 2) DEFAULT 4.20,
        ADD COLUMN IF NOT EXISTS qc_notes TEXT,
        ADD COLUMN IF NOT EXISTS debit_note_ref VARCHAR(100),
        ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
        // 2. Create grn_items table if not exists
        await db.query(`
      CREATE TABLE IF NOT EXISTS grn_items (
        id SERIAL PRIMARY KEY,
        grn_id INTEGER REFERENCES grns(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
        item_code VARCHAR(50) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        batch_no VARCHAR(100) NOT NULL,
        expiry_date VARCHAR(50) NOT NULL,
        ordered_quantity INTEGER NOT NULL,
        received_quantity INTEGER NOT NULL,
        accepted_quantity INTEGER DEFAULT 0,
        rejected_quantity INTEGER DEFAULT 0,
        unit_price NUMERIC(10, 2) DEFAULT 0.00,
        uom VARCHAR(50) DEFAULT 'units',
        qc_status VARCHAR(50) DEFAULT 'Pending QC',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_grns_number ON grns(grn_number);
      CREATE INDEX IF NOT EXISTS idx_grns_po_ref ON grns(po_ref);
      CREATE INDEX IF NOT EXISTS idx_grns_status ON grns(status);
      CREATE INDEX IF NOT EXISTS idx_grns_vendor_id ON grns(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON grn_items(grn_id);
    `);
        console.log('✅ [GRN & QC Migration]: Schema upgraded and indexes verified.');
        // 3. Clear old records to avoid duplicate conflicts
        await db.query('DELETE FROM grn_items;');
        await db.query('DELETE FROM grns;');
        // 4. Fetch real vendor IDs and Item IDs
        const vendorRes = await db.query('SELECT id, name FROM vendors ORDER BY id LIMIT 10;');
        const vendorsList = vendorRes.rows;
        const itemsRes = await db.query('SELECT id, item_code, name, uom, last_rate as unit_price FROM items ORDER BY id LIMIT 10;');
        const itemsList = itemsRes.rows;
        const vendorMap = {};
        vendorsList.forEach((v) => {
            vendorMap[v.name] = v.id;
        });
        const vendorNames = [
            'Aarogya Pharma Distributors',
            'Kavach Ortho Implants',
            'Sanjeevani Surgicals',
            'Spectra Bio Reagents',
            'Prakash Health Supplies',
        ];
        const inspectors = [
            'Inspector Anil V.',
            'Ananya Sen (QC Lead)',
            'Dr. Priya Nair',
            'Vikram Malhotra',
            'Chief Pharmacist QC',
        ];
        const sampleItems = itemsList.length > 0 ? itemsList : [
            { id: 1, item_code: 'DRG-00412', name: 'Inj. Ceftriaxone 1 g', uom: 'vials', unit_price: 38.40 },
            { id: 2, item_code: 'DRG-00105', name: 'Inj. Meropenem 1 g', uom: 'vials', unit_price: 185.00 },
            { id: 3, item_code: 'CON-00812', name: 'Surgical Gloves Size 7.5', uom: 'pairs', unit_price: 19.40 },
            { id: 4, item_code: 'CON-00940', name: 'Suture 2-0 Vicryl Plus', uom: 'foils', unit_price: 249.00 },
            { id: 6, item_code: 'LAB-00330', name: 'Hematology Cellpack DCL 20L', uom: 'drums', unit_price: 4500.00 },
        ];
        const defaultVendorId = vendorsList[0]?.id || 1;
        console.log('📦 [GRN & QC Migration]: Seeding 32 realistic hospital goods receipt notes (GRN-24-880 to GRN-24-849)...');
        for (let i = 0; i < 32; i++) {
            const grnNum = `GRN-24-${880 - i}`;
            const poRef = `PO-24-${1199 - i}`;
            const vendorName = vendorNames[i % vendorNames.length];
            const vendorId = vendorMap[vendorName] || defaultVendorId;
            const inspector = inspectors[i % inspectors.length];
            // Exact status distribution matching the UI
            let status = 'Expected';
            if (i === 0 || i === 4 || (i >= 8 && i % 4 === 0)) {
                status = 'Expected';
            }
            else if (i === 1 || i === 7 || (i >= 9 && i % 4 === 1)) {
                status = 'Pending QC';
            }
            else if (i === 3 || i === 11 || i === 19) {
                status = 'Partial Reject';
            }
            else if (i === 27) {
                status = 'QC Failed';
            }
            else {
                status = 'QC Passed';
            }
            const dayOffset = i % 5;
            const dateStr = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Yesterday' : `${dayOffset} days ago`;
            const linesCount = ((i * 7) % 20) + 1;
            let shortage = '-';
            let debitNoteRef = null;
            let qcNotes = 'All parameters, cold-chain seals, and batch assays verified compliant.';
            if (status === 'Partial Reject') {
                const shortQty = (i % 5) + 2;
                shortage = `${shortQty} items short`;
                debitNoteRef = `DN-24-${1040 + i}`;
                qcNotes = `Physical count discrepancy: ${shortQty} units short on delivery. Debit note issued to vendor.`;
            }
            else if (status === 'QC Failed') {
                shortage = 'Temperature breach (8.4°C)';
                debitNoteRef = `DN-24-${1040 + i}`;
                qcNotes = 'Cold-chain indicator tripped during transit. Biological integrity unverified. Consignment rejected.';
            }
            else if (status === 'Expected') {
                qcNotes = 'Advance Shipping Notice received from logistics carrier. Delivery expected at central loading dock.';
            }
            const tempCelsius = status === 'QC Failed' ? 8.4 : Number((3.6 + (i * 0.1) % 1.5).toFixed(1));
            const grnInsert = await db.query(`
        INSERT INTO grns (
          grn_number, po_ref, vendor_id, lines_count, shortage_notes,
          received_date, status, inspector_name, cold_chain_compliant,
          invoice_no, batch_number, expiry_date, temperature_celsius,
          qc_notes, debit_note_ref, received_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, CURRENT_TIMESTAMP - ($16 || ' days')::INTERVAL
        ) RETURNING id;
      `, [
                grnNum,
                poRef,
                vendorId,
                linesCount,
                shortage,
                dateStr,
                status,
                inspector,
                status !== 'QC Failed',
                `INV-24-${9000 + i}`,
                `B-${8900 + i}A`,
                'Dec 2026',
                tempCelsius,
                qcNotes,
                debitNoteRef,
                dayOffset,
            ]);
            const insertedGrnId = grnInsert.rows[0].id;
            // Seed line items for this GRN
            const linesToCreate = Math.min(3, linesCount);
            for (let j = 0; j < linesToCreate; j++) {
                const item = sampleItems[(i + j) % sampleItems.length];
                const ordQty = (j + 1) * 200;
                let recQty = ordQty;
                let accQty = ordQty;
                let rejQty = 0;
                let itemQcStatus = 'Passed';
                if (status === 'Partial Reject') {
                    rejQty = 20;
                    recQty = ordQty - rejQty;
                    accQty = recQty;
                    itemQcStatus = 'Rejected';
                }
                else if (status === 'QC Failed') {
                    recQty = ordQty;
                    accQty = 0;
                    rejQty = ordQty;
                    itemQcStatus = 'Rejected';
                }
                else if (status === 'Pending QC' || status === 'Expected') {
                    accQty = 0;
                    rejQty = 0;
                    itemQcStatus = 'Pending QC';
                }
                await db.query(`
          INSERT INTO grn_items (
            grn_id, item_id, item_code, item_name, batch_no, expiry_date,
            ordered_quantity, received_quantity, accepted_quantity, rejected_quantity,
            unit_price, uom, qc_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13
          );
        `, [
                    insertedGrnId,
                    item.id,
                    item.item_code,
                    item.name,
                    `BATCH-${8900 + i}-${j + 1}`,
                    j === 0 ? '12/2026' : '08/2027',
                    ordQty,
                    recQty,
                    accQty,
                    rejQty,
                    item.unit_price || 45.0,
                    item.uom || 'units',
                    itemQcStatus,
                ]);
            }
        }
        const countRes = await db.query('SELECT count(*)::int as total FROM grns;');
        const itemsCountRes = await db.query('SELECT count(*)::int as total FROM grn_items;');
        console.log(`🎉 [GRN & QC Migration Complete]: Successfully seeded ${countRes.rows[0].total} GRNs and ${itemsCountRes.rows[0].total} line items!`);
    }
    catch (err) {
        console.error('❌ [GRN & QC Migration Failed]:', err);
        throw err;
    }
}
// Direct execution
if (process.argv[1] && (process.argv[1].endsWith('migrate-grn.ts') || process.argv[1].endsWith('migrate-grn.js'))) {
    migrateGrn()
        .then(async () => {
        await pool.end();
        process.exit(0);
    })
        .catch(async () => {
        await pool.end();
        process.exit(1);
    });
}
