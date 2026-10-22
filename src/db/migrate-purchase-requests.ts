import { db } from '../config/db.js';

export async function migratePurchaseRequests() {
  console.log('🏥 [PostgreSQL Migration]: Starting Purchase Requests module migration...');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
    }

    // 1. Upgrade purchase_requests table schema
    await db.query(`
      ALTER TABLE purchase_requests 
      ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(50) DEFAULT 'Regular PO',
      ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Routine',
      ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS converted_to_po VARCHAR(50),
      ADD COLUMN IF NOT EXISTS converted_to_rfq VARCHAR(50);

      CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
      CREATE INDEX IF NOT EXISTS idx_purchase_requests_dept ON purchase_requests(department);
      CREATE INDEX IF NOT EXISTS idx_purchase_requests_created ON purchase_requests(created_at DESC);
    `);

    // 2. Upgrade purchase_request_items table schema
    await db.query(`
      ALTER TABLE purchase_request_items
      ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS item_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS uom VARCHAR(50) DEFAULT 'units';

      CREATE INDEX IF NOT EXISTS idx_pr_items_pr_id ON purchase_request_items(pr_id);
    `);

    console.log('✅ Purchase requests schema verified & updated.');

    // 3. Check existing PR count
    const countRes = await db.query('SELECT count(*) FROM purchase_requests');
    const existingCount = parseInt(countRes.rows[0].count, 10);
    console.log(`ℹ️ Existing PR count in DB: ${existingCount}`);

    // If fewer than 10 PRs, let's seed realistic enterprise hospital PRs
    if (existingCount < 10) {
      console.log('🌱 Seeding realistic hospital Purchase Requests data...');

      // Fetch sample items to link
      const itemsRes = await db.query('SELECT id, item_code, name, last_rate, uom FROM items LIMIT 10');
      const sampleItems = itemsRes.rows;

      const seedPrs = [
        {
          pr_number: 'PR-24-4095',
          source: 'Auto-reorder',
          department: 'Pharmacy',
          purchase_type: 'Rate Contract',
          priority: 'Urgent',
          status: 'Pending L1',
          raised_by_name: 'System (Telemetry)',
          estimated_value: 185000.00,
          remarks: 'Emergency buffer stock threshold breach for critical cephalosporins',
          ageDays: 1,
        },
        {
          pr_number: 'PR-24-4094',
          source: 'Manual',
          department: 'OT',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Pending CFO',
          raised_by_name: 'Dr. Menon (HOD Surgery)',
          estimated_value: 320000.00,
          remarks: 'High-volume laparoscopic trocar sets & disposable harmonic scalpel blades',
          ageDays: 2,
        },
        {
          pr_number: 'PR-24-4093',
          source: 'Indent Escalation',
          department: 'ICU',
          purchase_type: 'Emergency',
          priority: 'Emergency',
          status: 'Pending L1',
          raised_by_name: 'Sister Mary (ICU Incharge)',
          estimated_value: 95000.00,
          remarks: 'Ventilator breathing circuits and disposable bacterial filters',
          ageDays: 1,
        },
        {
          pr_number: 'PR-24-4092',
          source: 'Auto-reorder',
          department: 'Pharmacy',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Pending L1',
          raised_by_name: 'System',
          estimated_value: 145000.00,
          remarks: 'Threshold breach: Inj. Ceftriaxone & Meropenem IV vials',
          ageDays: 2,
        },
        {
          pr_number: 'PR-24-4091',
          source: 'Manual',
          department: 'OT',
          purchase_type: 'Rate Contract',
          priority: 'Urgent',
          status: 'Pending CFO',
          raised_by_name: 'Dr. Menon',
          estimated_value: 385000.00,
          remarks: 'High volume laparoscopy disposable trocars & sterile drapes',
          ageDays: 3,
        },
        {
          pr_number: 'PR-24-4090',
          source: 'Indent Escalation',
          department: 'Lab',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Approved',
          raised_by_name: 'Naveen K. (Lab Supervisor)',
          estimated_value: 85000.00,
          remarks: 'Sysmex hematology analyzer reagent pack replenishment',
          ageDays: 3,
          approved_by: 'Medical Superintendent',
        },
        {
          pr_number: 'PR-24-4089',
          source: 'Auto-reorder',
          department: 'General Admin',
          purchase_type: 'Rate Contract',
          priority: 'Routine',
          status: 'Approved',
          raised_by_name: 'System',
          estimated_value: 42000.00,
          remarks: 'Sterile packaging pouches quarterly run',
          ageDays: 4,
          approved_by: 'Procurement Manager',
        },
        {
          pr_number: 'PR-24-4088',
          source: 'Manual',
          department: 'Radiology',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Pending L1',
          raised_by_name: 'Dr. Sharma (Radiology Lead)',
          estimated_value: 175000.00,
          remarks: 'Non-ionic CT contrast media (Iohexol 350mg/ml) 100ml bottles',
          ageDays: 4,
        },
        {
          pr_number: 'PR-24-4087',
          source: 'Manual',
          department: 'Cardiology',
          purchase_type: 'Emergency',
          priority: 'Emergency',
          status: 'Approved',
          raised_by_name: 'Dr. R. Patel (Cath Lab)',
          estimated_value: 460000.00,
          remarks: 'Drug-eluting coronary stents & guide wires emergency replenish',
          ageDays: 5,
          approved_by: 'CFO / Director Medical',
        },
        {
          pr_number: 'PR-24-4086',
          source: 'Auto-reorder',
          department: 'Pharmacy',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Approved',
          raised_by_name: 'System',
          estimated_value: 120000.00,
          remarks: 'Paracetamol IV infusion 100ml buffer level top-up',
          ageDays: 6,
          approved_by: 'Chief Pharmacist',
        },
        {
          pr_number: 'PR-24-4085',
          source: 'Manual',
          department: 'Dialysis',
          purchase_type: 'Rate Contract',
          priority: 'Urgent',
          status: 'Pending CFO',
          raised_by_name: 'Dr. Verma (Nephrology)',
          estimated_value: 260000.00,
          remarks: 'Hemodialysis high-flux dialyzer membranes & blood tubing lines',
          ageDays: 5,
        },
        {
          pr_number: 'PR-24-4084',
          source: 'Indent Escalation',
          department: 'Central Store',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Rejected',
          raised_by_name: 'Store Manager Suresh',
          estimated_value: 65000.00,
          remarks: 'Duplicate request for PPE kits - stock already in transit',
          ageDays: 7,
          rejection_reason: 'Duplicate requisition. Already dispatched in PO-24-1198.',
        },
        {
          pr_number: 'PR-24-4083',
          source: 'Manual',
          department: 'Orthopedics',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Approved',
          raised_by_name: 'Dr. Kapoor (Ortho Surgeon)',
          estimated_value: 290000.00,
          remarks: 'Titanium trauma bone plates and cortical screws replenishment',
          ageDays: 8,
          approved_by: 'Medical Director',
        },
        {
          pr_number: 'PR-24-4082',
          source: 'Auto-reorder',
          department: 'Lab',
          purchase_type: 'Rate Contract',
          priority: 'Routine',
          status: 'Approved',
          raised_by_name: 'System',
          estimated_value: 78000.00,
          remarks: 'Biochemistry multi-calibrators & control sera for Abbott Architect',
          ageDays: 9,
          approved_by: 'Lab Director',
        },
        {
          pr_number: 'PR-24-4081',
          source: 'Manual',
          department: 'General Admin',
          purchase_type: 'Regular PO',
          priority: 'Routine',
          status: 'Rejected',
          raised_by_name: 'Facility Admin Roy',
          estimated_value: 110000.00,
          remarks: 'Non-standard ergonomic executive chairs requisition',
          ageDays: 10,
          rejection_reason: 'Disallowed outside annual Capex cycle. Re-submit in Q4.',
        },
      ];

      for (const pr of seedPrs) {
        // Insert PR
        const insertRes = await db.query(`
          INSERT INTO purchase_requests (
            pr_number, source, department, purchase_type, priority, items_count, 
            estimated_value, status, raised_by_name, remarks, approved_by, 
            approved_at, rejection_reason, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::VARCHAR, 
            CASE WHEN $11::VARCHAR IS NOT NULL THEN CURRENT_TIMESTAMP - ($12::VARCHAR || ' days')::INTERVAL ELSE NULL END,
            $13::TEXT, CURRENT_TIMESTAMP - ($12::VARCHAR || ' days')::INTERVAL, CURRENT_TIMESTAMP
          )
          ON CONFLICT (pr_number) DO UPDATE SET
            purchase_type = EXCLUDED.purchase_type,
            priority = EXCLUDED.priority,
            department = EXCLUDED.department,
            estimated_value = EXCLUDED.estimated_value,
            status = EXCLUDED.status,
            remarks = EXCLUDED.remarks,
            approved_by = EXCLUDED.approved_by,
            rejection_reason = EXCLUDED.rejection_reason
          RETURNING id;
        `, [
          pr.pr_number,
          pr.source,
          pr.department,
          pr.purchase_type,
          pr.priority,
          (pr.pr_number.charCodeAt(8) % 6) + 2,
          pr.estimated_value,
          pr.status,
          pr.raised_by_name,
          pr.remarks,
          pr.approved_by || null,
          String(pr.ageDays),
          pr.rejection_reason || null,
        ]);

        const prId = insertRes.rows[0]?.id;

        // Insert line items for this PR
        if (prId && sampleItems.length > 0) {
          // Check if items already exist
          const existingItems = await db.query('SELECT count(*) FROM purchase_request_items WHERE pr_id = $1', [prId]);
          if (parseInt(existingItems.rows[0].count, 10) === 0) {
            const numLines = Math.min((pr.pr_number.charCodeAt(8) % 3) + 2, sampleItems.length);
            for (let j = 0; j < numLines; j++) {
              const it = sampleItems[j];
              const qty = (j + 1) * 20;
              const rate = parseFloat(it.last_rate || '150.00');
              const total = qty * rate;

              await db.query(`
                INSERT INTO purchase_request_items (
                  pr_id, item_id, item_name, item_code, quantity, uom, estimated_unit_rate, total_amount
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `, [
                prId,
                it.id,
                it.name,
                it.item_code,
                qty,
                it.uom || 'units',
                rate,
                total,
              ]);
            }
          }
        }
      }

      console.log('✅ Successfully seeded comprehensive Purchase Requests and line items!');
    }

  } catch (err) {
    console.error('❌ Failed to run purchase requests migration:', err);
    throw err;
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('migrate-purchase-requests')) {
  migratePurchaseRequests().then(() => {
    console.log('Migration finished.');
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
