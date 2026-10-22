import { db } from '../config/db.js';
export async function migratePurchaseOrdersModule() {
    console.log('📦 [Purchase Orders Migration]: Starting database upgrade and seeding...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Database connection failed: ${conn.error}`);
        }
        console.log(` Connected to database: "${conn.database}"`);
        // 1. Upgrade purchase_orders table schema
        await db.query(`
      ALTER TABLE purchase_orders 
        ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS shipping_address TEXT DEFAULT 'Central Receiving Dock, Apex Super Specialty Hospital, Main Campus',
        ADD COLUMN IF NOT EXISTS billing_address TEXT DEFAULT 'Accounts Dept, Apex Super Specialty Hospital, Main Campus',
        ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100),
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

      ALTER TABLE purchase_order_items
        ADD COLUMN IF NOT EXISTS item_code VARCHAR(50),
        ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS uom VARCHAR(50) DEFAULT 'units';

      CREATE INDEX IF NOT EXISTS idx_pos_number ON purchase_orders(po_number);
      CREATE INDEX IF NOT EXISTS idx_pos_vendor_id ON purchase_orders(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_pos_status ON purchase_orders(status);
      CREATE INDEX IF NOT EXISTS idx_pos_po_type ON purchase_orders(po_type);
      CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
    `);
        console.log('✅ Schema upgraded with tracking, shipping, and item detail columns.');
        // 2. Fetch existing vendors and formulary items
        const vendorsRes = await db.query('SELECT id, name, vendor_code FROM vendors ORDER BY id LIMIT 10;');
        const vendorsList = vendorsRes.rows;
        const itemsRes = await db.query('SELECT id, item_code, name, uom, last_rate as unit_price FROM items ORDER BY id LIMIT 10;');
        const itemsList = itemsRes.rows;
        const sampleItems = itemsList.length > 0 ? itemsList : [
            { id: 1, item_code: 'DRG-00412', name: 'Inj. Ceftriaxone 1 g', uom: 'vials', unit_price: 38.40 },
            { id: 2, item_code: 'DRG-00105', name: 'Inj. Meropenem 1 g', uom: 'vials', unit_price: 185.00 },
            { id: 3, item_code: 'CON-00812', name: 'Surgical Gloves Size 7.5', uom: 'pairs', unit_price: 19.40 },
            { id: 4, item_code: 'CON-00940', name: 'Suture 2-0 Vicryl Plus', uom: 'foils', unit_price: 249.00 },
            { id: 5, item_code: 'LAB-00330', name: 'Hematology Cellpack DCL 20L', uom: 'drums', unit_price: 4500.00 },
        ];
        const vendorNames = [
            'Aarogya Pharma Distributors',
            'Kavach Ortho Implants',
            'Sanjeevani Surgicals',
            'Spectra Bio Reagents',
            'Prakash Health Supplies',
            'Nova MedEquip Traders',
        ];
        const types = [
            'Regular PO',
            'Rate-contract PO',
            'Blanket PO',
            'Consignment',
            'Capex PO',
            'Emergency purchase',
        ];
        const statuses = ['Dispatched', 'Accepted', 'Overdue', 'Awaiting approval', 'Draft'];
        // Map vendor names to database vendor IDs
        const vendorMap = {};
        vendorsList.forEach((v) => {
            vendorMap[v.name] = v.id;
        });
        const defaultVendorId = vendorsList[0]?.id || 1;
        // 3. Clear existing PO line items and POs for fresh consistent seed
        await db.query('DELETE FROM purchase_order_items;');
        await db.query('DELETE FROM purchase_orders;');
        console.log('🌱 Seeding 45 realistic hospital purchase orders (PO-24-1200 down to PO-24-1156)...');
        for (let i = 0; i < 45; i++) {
            const poNum = `PO-24-${1200 - i}`;
            const vendorName = vendorNames[i % vendorNames.length];
            const vendorId = vendorMap[vendorName] || defaultVendorId;
            const poType = types[i % types.length];
            let status = statuses[i % statuses.length];
            // Exactly align with KPI: Overdue on index % 7, etc.
            if (i % 7 === 0)
                status = 'Overdue';
            if (i === 1 || i === 8 || i === 15 || i === 22 || i === 29 || i === 36 || i === 43) {
                status = 'Awaiting approval';
            }
            const daysOffset = (i * 3) % 14;
            const dueDate = status === 'Overdue'
                ? `${daysOffset + 1} d overdue`
                : (status === 'Dispatched' || status === 'Accepted')
                    ? `In ${daysOffset + 1} days`
                    : '-';
            const itemsCount = ((i * 5) % 40) + 1;
            const totalValueLakhs = Number((((i * 13) % 80) + 1).toFixed(1));
            const totalValueRupees = totalValueLakhs * 100000;
            const createdDaysAgo = i % 20;
            const poInsertRes = await db.query(`
        INSERT INTO purchase_orders (
          po_number, vendor_id, po_type, items_count, total_value,
          status, due_date, payment_terms, notes,
          approved_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, CURRENT_TIMESTAMP - ($11 || ' days')::INTERVAL, CURRENT_TIMESTAMP
        ) RETURNING id;
      `, [
                poNum,
                vendorId,
                poType,
                itemsCount,
                totalValueRupees,
                status,
                dueDate,
                'Net 30',
                `Hospital Procurement Order for ${poType}. Inbound delivery expected at Central Receiving Dock.`,
                status !== 'Awaiting approval' && status !== 'Draft' ? 'Dr. Rajesh Sharma (CPO)' : null,
                createdDaysAgo
            ]);
            const poId = poInsertRes.rows[0].id;
            // Seed 2-4 realistic line items per PO
            const numLines = Math.min(itemsCount, (i % 3) + 2);
            for (let j = 0; j < numLines; j++) {
                const item = sampleItems[(i + j) % sampleItems.length];
                const qty = Math.max(10, Math.floor(totalValueRupees / (numLines * (Number(item.unit_price) || 100))));
                const unitPrice = Number(item.unit_price) || 120.00;
                const lineTotal = qty * unitPrice;
                await db.query(`
          INSERT INTO purchase_order_items (
            po_id, item_id, item_code, item_name, quantity,
            unit_price, tax_percent, line_total, uom
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `, [
                    poId,
                    item.id,
                    item.item_code,
                    item.name,
                    qty,
                    unitPrice,
                    12.0,
                    lineTotal,
                    item.uom || 'units'
                ]);
            }
        }
        const checkCount = await db.query('SELECT count(*)::int as total FROM purchase_orders;');
        const checkItems = await db.query('SELECT count(*)::int as total FROM purchase_order_items;');
        console.log(`🎉 [Purchase Orders Migration Complete]: Seeded ${checkCount.rows[0].total} POs and ${checkItems.rows[0].total} line items!`);
    }
    catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}
// Execute directly if run via CLI
if (process.argv[1]?.includes('migrate-pos')) {
    migratePurchaseOrdersModule()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
