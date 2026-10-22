import { db } from '../config/db.js';

export async function migrateInvoicesModule() {
  console.log('🏥 [PostgreSQL Migration]: Starting Invoices & Payments module migration...');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
    }

    // 1. Extend invoices table with financial & matching columns
    await db.query(`
      ALTER TABLE invoices 
      ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS due_date_actual DATE,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS three_way_match_status VARCHAR(50) DEFAULT 'Matched',
      ADD COLUMN IF NOT EXISTS document_url TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date_actual);
      CREATE INDEX IF NOT EXISTS idx_invoices_po_ref ON invoices(po_ref);
    `);
    console.log('✅ invoices table schema upgraded with 3-way matching and tracking columns.');

    // 2. Create payment_transactions table for ledger sync
    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
          id SERIAL PRIMARY KEY,
          transaction_ref VARCHAR(50) UNIQUE NOT NULL,
          invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
          invoice_number VARCHAR(50) NOT NULL,
          vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT,
          vendor_name VARCHAR(255) NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL, -- 'bank', 'cheque'
          payment_ref VARCHAR(100) NOT NULL,   -- UTR number or Cheque number
          payment_date DATE NOT NULL,
          status VARCHAR(50) DEFAULT 'Completed',
          processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payment_transactions(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_payments_date ON payment_transactions(payment_date);
    `);
    console.log('✅ payment_transactions table created.');

    // 3. Ensure required vendors exist in the database
    const vendorsList = [
      { name: 'Aarogya Pharma Distributors', code: 'VND-001', category: 'Pharmaceuticals' },
      { name: 'Kavach Ortho Implants', code: 'VND-002', category: 'Surgical & Implants' },
      { name: 'Sanjeevani Surgicals', code: 'VND-003', category: 'Surgical Consumables' },
      { name: 'Spectra Bio Reagents', code: 'VND-004', category: 'Lab & Diagnostics' },
      { name: 'Prakash Health Supplies', code: 'VND-005', category: 'Medical Equipment' },
      { name: 'LifeCare Logistics', code: 'VND-006', category: 'Hospital Supplies' },
      { name: 'Apex Medical Systems', code: 'VND-007', category: 'Bio-Medical AMC' },
    ];

    for (const v of vendorsList) {
      await db.query(`
        INSERT INTO vendors (vendor_code, name, category, status)
        VALUES ($1, $2, $3, 'Active')
        ON CONFLICT (vendor_code) DO NOTHING;
      `, [v.code, v.name, v.category]);
    }

    // Retrieve vendor IDs mapping
    const vendorRows = await db.query('SELECT id, name FROM vendors');
    const vendorMap = new Map<string, number>();
    vendorRows.rows.forEach(r => vendorMap.set(r.name, r.id));

    // Clear existing invoices to insert clean, consistent 50 items matching screenshot
    await db.query('DELETE FROM payment_transactions');
    await db.query('DELETE FROM invoices');

    // 4. Generate 50 realistic hospital invoices
    const vendors = [
      'Aarogya Pharma Distributors',
      'Kavach Ortho Implants',
      'Sanjeevani Surgicals',
      'Spectra Bio Reagents',
      'Prakash Health Supplies',
      'LifeCare Logistics',
    ];

    const today = new Date();

    for (let i = 0; i < 50; i++) {
      const invNum = `INV-24-${4090 - i}`;
      const poRef = `PO-24-${1199 - i}`;
      const vendorName = vendors[i % vendors.length];
      const vendorId = vendorMap.get(vendorName) || vendorRows.rows[0]?.id || 1;

      // Match exact amounts from the screenshot:
      // Row 0: 5.0K (5000), Row 1: 19.0K (19000), Row 2: 33.0K (33000), Row 3: 47.0K (47000),
      // Row 4: 61.0K (61000), Row 5: 75.0K (75000), Row 6: 89.0K (89000)
      const amount = ((i * 14) % 90 + 5) * 1000;

      // Status distribution matching screenshot:
      // 0: Overdue (1 d overdue)
      // 1: Processing (In 8 days)
      // 2: Overdue (15 d overdue)
      // 3: Paid (Settled)
      // 4: Pending GRN (In 29 days)
      // 5: Pending (In 6 days)
      // 6: Paid (Settled)
      let status: 'Pending' | 'Processing' | 'Overdue' | 'Paid' | 'Pending GRN' = 'Pending';
      let dueOffset = 0; // days relative to today (+ positive: in future, - negative: overdue)
      let dueText = '';
      let matchStatus = 'Matched';
      let paidAt: string | null = null;
      let paymentRef: string | null = null;
      let paymentMethod: string | null = null;

      const mod = i % 7;
      if (mod === 0) {
        status = 'Overdue';
        dueOffset = -1;
        dueText = '1 d overdue';
      } else if (mod === 1) {
        status = 'Processing';
        dueOffset = 8;
        dueText = 'In 8 days';
      } else if (mod === 2) {
        status = 'Overdue';
        dueOffset = -15;
        dueText = '15 d overdue';
      } else if (mod === 3) {
        status = 'Paid';
        dueOffset = -2;
        dueText = 'Settled';
        paidAt = new Date(today.getTime() - (i % 3 === 0 ? 0 : 2) * 86400000).toISOString();
        paymentRef = `UTR-HDFC-${99000 + i}`;
        paymentMethod = 'bank';
      } else if (mod === 4) {
        status = 'Pending GRN';
        dueOffset = 29;
        dueText = 'In 29 days';
        matchStatus = 'Awaiting GRN';
      } else if (mod === 5) {
        status = 'Pending';
        dueOffset = 6;
        dueText = 'In 6 days';
      } else if (mod === 6) {
        status = 'Paid';
        dueOffset = -5;
        dueText = 'Settled';
        paidAt = new Date(today.getTime() - (i % 2 === 0 ? 0 : 4) * 86400000).toISOString();
        paymentRef = `CHQ-${440000 + i}`;
        paymentMethod = 'cheque';
      }

      const dueDateActual = new Date(today.getTime() + dueOffset * 86400000);
      const dueDateFormatted = dueDateActual.toISOString().split('T')[0];

      const res = await db.query(`
        INSERT INTO invoices (
          invoice_number, po_ref, vendor_id, vendor_name, amount, 
          due_date, due_date_actual, status, three_way_match_status,
          paid_at, payment_ref, payment_method, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, NOW() - ($13 || ' hours')::INTERVAL
        ) RETURNING id;
      `, [
        invNum, poRef, vendorId, vendorName, amount,
        dueText, dueDateFormatted, status, matchStatus,
        paidAt, paymentRef, paymentMethod, String(i * 3)
      ]);

      const insertedId = res.rows[0].id;

      // If Paid, record payment transaction
      if (status === 'Paid') {
        await db.query(`
          INSERT INTO payment_transactions (
            transaction_ref, invoice_id, invoice_number, vendor_id, vendor_name,
            amount, payment_method, payment_ref, payment_date, status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, 'Completed'
          );
        `, [
          `TXN-24-${9000 + i}`, insertedId, invNum, vendorId, vendorName,
          amount, paymentMethod || 'bank', paymentRef || 'UTR-000000', dueDateFormatted
        ]);
      }
    }

    console.log('✅ 50 realistic hospital invoices seeded successfully.');
    console.log('🎉 [PostgreSQL Migration]: Invoices & Payments module migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Direct execution
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('migrate-invoices')) {
  migrateInvoicesModule()
    .then(() => {
      console.log('Migration finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
