import { db } from '../config/db.js';

export async function migrateRfqsModule() {
  console.log('📦 [RFQ & Quotes Migration]: Starting database upgrade and seeding...');

  try {
    const conn = await db.checkConnection();
    if (!conn.connected) {
      throw new Error(`Database connection failed: ${conn.error}`);
    }
    console.log(`Connected to database: "${conn.database}"`);

    // 1. Upgrade and create RFQ tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id SERIAL PRIMARY KEY,
        rfq_number VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Surgicals & Consumables',
        department VARCHAR(100) DEFAULT 'Operation Theatre',
        status VARCHAR(50) DEFAULT 'Evaluation',
        invited_count INTEGER DEFAULT 4,
        responded_count INTEGER DEFAULT 3,
        closes_at_label VARCHAR(100) DEFAULT 'closes 9 Oct 17:00',
        closing_date TIMESTAMP WITH TIME ZONE,
        awarded_vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
        awarded_po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
        awarded_at TIMESTAMP WITH TIME ZONE,
        benchmark_total NUMERIC(12, 2) DEFAULT 0,
        savings_amount NUMERIC(12, 2) DEFAULT 0,
        savings_percent NUMERIC(5, 2) DEFAULT 0,
        remarks TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE rfqs 
        ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Surgicals & Consumables',
        ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'Operation Theatre',
        ADD COLUMN IF NOT EXISTS invited_count INTEGER DEFAULT 4,
        ADD COLUMN IF NOT EXISTS responded_count INTEGER DEFAULT 3,
        ADD COLUMN IF NOT EXISTS closes_at_label VARCHAR(100) DEFAULT 'closes 9 Oct 17:00',
        ADD COLUMN IF NOT EXISTS awarded_po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS benchmark_total NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS savings_amount NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS savings_percent NUMERIC(5, 2) DEFAULT 0;

      CREATE TABLE IF NOT EXISTS rfq_items (
        id SERIAL PRIMARY KEY,
        rfq_id INTEGER REFERENCES rfqs(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
        item_code VARCHAR(50),
        item_name VARCHAR(255) NOT NULL,
        uom VARCHAR(50) DEFAULT 'units',
        quantity INTEGER NOT NULL,
        last_price NUMERIC(10, 2) NOT NULL,
        target_price NUMERIC(10, 2),
        recommended_vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
        recommended_vendor_name VARCHAR(255),
        is_new_vendor BOOLEAN DEFAULT FALSE,
        notes TEXT
      );

      ALTER TABLE rfq_items
        ADD COLUMN IF NOT EXISTS item_code VARCHAR(50),
        ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS uom VARCHAR(50) DEFAULT 'units',
        ADD COLUMN IF NOT EXISTS last_price NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS target_price NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS recommended_vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS recommended_vendor_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS is_new_vendor BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS notes TEXT;

      CREATE TABLE IF NOT EXISTS rfq_quotes (
        id SERIAL PRIMARY KEY,
        rfq_id INTEGER REFERENCES rfqs(id) ON DELETE CASCADE,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
        vendor_name VARCHAR(255) NOT NULL,
        quote_ref VARCHAR(100),
        credit_terms VARCHAR(100) DEFAULT '30 d credit',
        delivery_lead VARCHAR(100) DEFAULT '5 d delivery',
        total_quoted_amount NUMERIC(12, 2) NOT NULL,
        is_partial BOOLEAN DEFAULT FALSE,
        vendor_score VARCHAR(50) DEFAULT 'A · 90',
        is_new_vendor BOOLEAN DEFAULT FALSE,
        is_awarded BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'Submitted',
        negotiation_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE rfq_quotes
        ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS credit_terms VARCHAR(100) DEFAULT '30 d credit',
        ADD COLUMN IF NOT EXISTS delivery_lead VARCHAR(100) DEFAULT '5 d delivery',
        ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS vendor_score VARCHAR(50) DEFAULT 'A · 90',
        ADD COLUMN IF NOT EXISTS is_new_vendor BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS negotiation_notes TEXT;

      CREATE TABLE IF NOT EXISTS rfq_quote_items (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES rfq_quotes(id) ON DELETE CASCADE,
        rfq_item_id INTEGER REFERENCES rfq_items(id) ON DELETE CASCADE,
        unit_price NUMERIC(10, 2),
        tax_percent NUMERIC(5, 2) DEFAULT 12.0,
        total_price NUMERIC(12, 2),
        is_l1 BOOLEAN DEFAULT FALSE,
        is_no_bid BOOLEAN DEFAULT FALSE,
        notes TEXT
      );

      ALTER TABLE rfq_quote_items
        ALTER COLUMN unit_price DROP NOT NULL,
        ALTER COLUMN total_price DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS is_l1 BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_no_bid BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS notes TEXT;

      -- 2. Configuration tables for Approval Matrix and Supported Purchase Types
      CREATE TABLE IF NOT EXISTS approval_matrices (
        id SERIAL PRIMARY KEY,
        po_value_tier VARCHAR(100) NOT NULL,
        level_1 VARCHAR(100) NOT NULL,
        level_2 VARCHAR(100),
        level_3 VARCHAR(100),
        remarks VARCHAR(255),
        display_order INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS purchase_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        display_order INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_rfqs_number ON rfqs(rfq_number);
      CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
      CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id ON rfq_items(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq_id ON rfq_quotes(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_quote_items_quote_id ON rfq_quote_items(quote_id);
    `);
    console.log('✅ RFQ & Quotes database schema verified.');

    // 2. Fetch or create reference vendors
    const vendorSanjeevani = (await db.query(`SELECT id, name FROM vendors WHERE name ILIKE '%Sanjeevani%' LIMIT 1`)).rows[0];
    const vendorPrakash = (await db.query(`SELECT id, name FROM vendors WHERE name ILIKE '%Prakash Health%' LIMIT 1`)).rows[0];
    const vendorNova = (await db.query(`SELECT id, name FROM vendors WHERE name ILIKE '%Nova MedEquip%' LIMIT 1`)).rows[0];

    const vSanjeevaniId = vendorSanjeevani?.id || 2;
    const vPrakashId = vendorPrakash?.id || 4;
    const vNovaId = vendorNova?.id || 5;

    // 3. Clear existing data in rfq tables for fresh seed
    await db.query(`DELETE FROM rfq_quote_items;`);
    await db.query(`DELETE FROM rfq_quotes;`);
    await db.query(`DELETE FROM rfq_items;`);
    await db.query(`DELETE FROM rfqs;`);
    await db.query(`DELETE FROM approval_matrices;`);
    await db.query(`DELETE FROM purchase_types;`);

    console.log('🌱 Seeding RFQ-24-0318 and companion RFQ comparison datasets...');

    // Seed RFQ 1: RFQ-24-0318 (Target RFQ matching the page design exactly)
    const rfq1Res = await db.query(`
      INSERT INTO rfqs (
        rfq_number, title, category, department, status,
        invited_count, responded_count, closes_at_label, closing_date,
        benchmark_total, savings_amount, savings_percent, remarks
      ) VALUES (
        'RFQ-24-0318', 'OT consumables — quarterly', 'Surgicals & Consumables', 'Operation Theatre', 'Evaluation',
        4, 3, 'closes 9 Oct 17:00', CURRENT_TIMESTAMP + INTERVAL '3 days',
        627000.00, 28400.00, 4.5, 'OT quarterly bulk tender. 4 vendors invited, 3 responded.'
      ) RETURNING id;
    `);
    const rfq1Id = rfq1Res.rows[0].id;

    // Seed Items for RFQ 1:
    // Item 1: Surgical gloves 7.0 (pair) | 6,000 | Last: 21.0
    const it1Res = await db.query(`
      INSERT INTO rfq_items (
        rfq_id, item_code, item_name, uom, quantity, last_price,
        recommended_vendor_id, recommended_vendor_name, is_new_vendor
      ) VALUES ($1, 'CON-GLV-70', 'Surgical gloves 7.0 (pair)', 'pair', 6000, 21.00, $2, 'Sanjeevani', false)
      RETURNING id;
    `, [rfq1Id, vSanjeevaniId]);
    const it1Id = it1Res.rows[0].id;

    // Item 2: Suture 2-0 Vicryl | 480 | Last: 265
    const it2Res = await db.query(`
      INSERT INTO rfq_items (
        rfq_id, item_code, item_name, uom, quantity, last_price,
        recommended_vendor_id, recommended_vendor_name, is_new_vendor
      ) VALUES ($1, 'CON-VIC-20', 'Suture 2-0 Vicryl', 'box', 480, 265.00, $2, 'Prakash Health', false)
      RETURNING id;
    `, [rfq1Id, vPrakashId]);
    const it2Id = it2Res.rows[0].id;

    // Item 3: Drape pack, sterile | 900 | Last: 310
    const it3Res = await db.query(`
      INSERT INTO rfq_items (
        rfq_id, item_code, item_name, uom, quantity, last_price,
        recommended_vendor_id, recommended_vendor_name, is_new_vendor
      ) VALUES ($1, 'CON-DRP-ST', 'Drape pack, sterile', 'pack', 900, 310.00, $2, 'Sanjeevani', false)
      RETURNING id;
    `, [rfq1Id, vSanjeevaniId]);
    const it3Id = it3Res.rows[0].id;

    // Item 4: Skin stapler 35W | 120 | Last: 780
    const it4Res = await db.query(`
      INSERT INTO rfq_items (
        rfq_id, item_code, item_name, uom, quantity, last_price,
        recommended_vendor_id, recommended_vendor_name, is_new_vendor
      ) VALUES ($1, 'SUR-STP-35', 'Skin stapler 35W', 'piece', 120, 780.00, $2, 'Nova MedEquip', true)
      RETURNING id;
    `, [rfq1Id, vNovaId]);
    const it4Id = it4Res.rows[0].id;

    // Seed Quotes for RFQ 1:
    // Vendor A: Sanjeevani Surgicals (45 d credit · 3 d delivery, Total: ₹6.02L, Score: A · 94)
    const qSanjeevani = await db.query(`
      INSERT INTO rfq_quotes (
        rfq_id, vendor_id, vendor_name, quote_ref, credit_terms, delivery_lead,
        total_quoted_amount, is_partial, vendor_score, is_new_vendor, status
      ) VALUES (
        $1, $2, 'Sanjeevani Surgicals', 'QUO-SANJ-0912', '45 d credit', '3 d delivery',
        602000.00, false, 'A · 94', false, 'Submitted'
      ) RETURNING id;
    `, [rfq1Id, vSanjeevaniId]);
    const qSanjId = qSanjeevani.rows[0].id;

    // Vendor B: Prakash Health Supplies (30 d credit · 5 d delivery, Total: ₹6.08L, Score: A · 90)
    const qPrakash = await db.query(`
      INSERT INTO rfq_quotes (
        rfq_id, vendor_id, vendor_name, quote_ref, credit_terms, delivery_lead,
        total_quoted_amount, is_partial, vendor_score, is_new_vendor, status
      ) VALUES (
        $1, $2, 'Prakash Health Supplies', 'QUO-PRAK-4421', '30 d credit', '5 d delivery',
        608000.00, false, 'A · 90', false, 'Submitted'
      ) RETURNING id;
    `, [rfq1Id, vPrakashId]);
    const qPrakId = qPrakash.rows[0].id;

    // Vendor C: Nova MedEquip Traders (60 d credit · 7 d delivery, Total: Partial, Score: Unrated, New Vendor)
    const qNova = await db.query(`
      INSERT INTO rfq_quotes (
        rfq_id, vendor_id, vendor_name, quote_ref, credit_terms, delivery_lead,
        total_quoted_amount, is_partial, vendor_score, is_new_vendor, status
      ) VALUES (
        $1, $2, 'Nova MedEquip Traders', 'QUO-NOVA-8812', '60 d credit', '7 d delivery',
        350400.00, true, 'Unrated', true, 'Submitted'
      ) RETURNING id;
    `, [rfq1Id, vNovaId]);
    const qNovaId = qNova.rows[0].id;

    // Seed Quote Items:
    // Sanjeevani items:
    // Item 1: 19.4 (L1) | Item 2: 258 | Item 3: 298 (L1) | Item 4: 765
    await db.query(`
      INSERT INTO rfq_quote_items (quote_id, rfq_item_id, unit_price, total_price, is_l1, is_no_bid) VALUES
      ($1, $2, 19.40, 116400.00, true, false),
      ($1, $3, 258.00, 123840.00, false, false),
      ($1, $4, 298.00, 268200.00, true, false),
      ($1, $5, 765.00, 91800.00, false, false);
    `, [qSanjId, it1Id, it2Id, it3Id, it4Id]);

    // Prakash Health items:
    // Item 1: 20.1 | Item 2: 249 (L1) | Item 3: 305 | Item 4: 772
    await db.query(`
      INSERT INTO rfq_quote_items (quote_id, rfq_item_id, unit_price, total_price, is_l1, is_no_bid) VALUES
      ($1, $2, 20.10, 120600.00, false, false),
      ($1, $3, 249.00, 119520.00, true, false),
      ($1, $4, 305.00, 274500.00, false, false),
      ($1, $5, 772.00, 92640.00, false, false);
    `, [qPrakId, it1Id, it2Id, it3Id, it4Id]);

    // Nova MedEquip items:
    // Item 1: 22.0 | Item 2: 270 | Item 3: No bid | Item 4: 740 (L1)
    await db.query(`
      INSERT INTO rfq_quote_items (quote_id, rfq_item_id, unit_price, total_price, is_l1, is_no_bid) VALUES
      ($1, $2, 22.00, 132000.00, false, false),
      ($1, $3, 270.00, 129600.00, false, false),
      ($1, $4, NULL, NULL, false, true),
      ($1, $5, 740.00, 88800.00, true, false);
    `, [qNovaId, it1Id, it2Id, it3Id, it4Id]);

    // Seed RFQ 2: RFQ-24-0319 ("Critical Care Syringe Infusion Pumps & Extension Lines")
    const rfq2Res = await db.query(`
      INSERT INTO rfqs (
        rfq_number, title, category, department, status,
        invited_count, responded_count, closes_at_label, closing_date,
        benchmark_total, savings_amount, savings_percent, remarks
      ) VALUES (
        'RFQ-24-0319', 'ICU Infusion Pumps & Dedicated Lines', 'Critical Care Equipment', 'Intensive Care Unit (ICU)', 'Evaluation',
        5, 3, 'closes 24 Oct 18:00', CURRENT_TIMESTAMP + INTERVAL '10 days',
        1420000.00, 95000.00, 6.7, 'Annual rate contract for ICU infusion syringe drivers and microbore IV extension lines.'
      ) RETURNING id;
    `);
    const rfq2Id = rfq2Res.rows[0].id;

    const it2_1 = (await db.query(`
      INSERT INTO rfq_items (rfq_id, item_code, item_name, uom, quantity, last_price, recommended_vendor_id, recommended_vendor_name, is_new_vendor)
      VALUES ($1, 'ICU-INF-PMP', 'Syringe Infusion Driver 50ml', 'units', 15, 65000.00, $2, 'Nova MedEquip', false) RETURNING id;
    `, [rfq2Id, vNovaId])).rows[0].id;

    const it2_2 = (await db.query(`
      INSERT INTO rfq_items (rfq_id, item_code, item_name, uom, quantity, last_price, recommended_vendor_id, recommended_vendor_name, is_new_vendor)
      VALUES ($1, 'CON-EXT-150', 'Microbore Extension Line 150cm', 'pack', 2000, 222.50, $2, 'Sanjeevani', false) RETURNING id;
    `, [rfq2Id, vSanjeevaniId])).rows[0].id;

    const q2Nova = (await db.query(`
      INSERT INTO rfq_quotes (rfq_id, vendor_id, vendor_name, quote_ref, credit_terms, delivery_lead, total_quoted_amount, is_partial, vendor_score, status)
      VALUES ($1, $2, 'Nova MedEquip Traders', 'QUO-NOVA-9002', '45 d credit', '7 d delivery', 1335000.00, false, 'A · 92', 'Submitted') RETURNING id;
    `, [rfq2Id, vNovaId])).rows[0].id;

    const q2Sanj = (await db.query(`
      INSERT INTO rfq_quotes (rfq_id, vendor_id, vendor_name, quote_ref, credit_terms, delivery_lead, total_quoted_amount, is_partial, vendor_score, status)
      VALUES ($1, $2, 'Sanjeevani Surgicals', 'QUO-SANJ-1104', '30 d credit', '4 d delivery', 1360000.00, false, 'A · 94', 'Submitted') RETURNING id;
    `, [rfq2Id, vSanjeevaniId])).rows[0].id;

    await db.query(`
      INSERT INTO rfq_quote_items (quote_id, rfq_item_id, unit_price, total_price, is_l1, is_no_bid) VALUES
      ($1, $2, 61000.00, 915000.00, true, false),
      ($1, $3, 210.00, 420000.00, false, false),
      ($4, $2, 64000.00, 960000.00, false, false),
      ($4, $3, 200.00, 400000.00, true, false);
    `, [q2Nova, it2_1, it2_2, q2Sanj]);

    // 4. Seed Approval Matrix Table
    console.log('🌱 Seeding Approval Matrix table...');
    await db.query(`
      INSERT INTO approval_matrices (po_value_tier, level_1, level_2, level_3, remarks, display_order) VALUES
      ('Up to ₹50,000', 'Purchase officer', '—', '—', 'Standard departmental requisition', 1),
      ('₹50,000 – ₹5 L', 'Purchase head', 'Department HOD', '—', 'Standard dual-tier authorization', 2),
      ('₹5 L – ₹25 L', 'Purchase head', 'CFO', '—', 'Executive financial governance', 3),
      ('Above ₹25 L / capex', 'Purchase committee', 'CFO', 'MD / Board', 'Statutory board level approval', 4),
      ('Emergency purchase', 'Duty manager', 'Post-facto review within 48 h', '—', 'Triage emergency override protocol', 5);
    `);

    // 5. Seed Purchase Types Table
    console.log('🌱 Seeding Supported Purchase Types table...');
    await db.query(`
      INSERT INTO purchase_types (name, description, display_order) VALUES
      ('Regular PO', 'from PR or auto-reorder', 1),
      ('Rate-contract PO', 'no RFQ needed within validity', 2),
      ('Blanket / scheduled PO', 'monthly call-offs', 3),
      ('Consignment', 'implants billed only when used', 4),
      ('Capex PO', 'equipment, creates asset on GRN', 5),
      ('Service PO', 'AMC, housekeeping, lab outsourcing', 6),
      ('Emergency / local purchase', 'capped and reviewed', 7);
    `);

    console.log('🎉 [RFQ & Quotes Migration]: Migration and seeding completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

if (process.argv[1]?.includes('migrate-rfqs.ts')) {
  migrateRfqsModule()
    .then(() => {
      console.log('Migration script complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
