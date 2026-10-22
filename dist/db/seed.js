import bcrypt from 'bcryptjs';
import { db, pool } from '../config/db.js';
export async function seedDatabase() {
    console.log('🌱 [PostgreSQL Seeder]: Starting database seed...');
    try {
        // 1. Seed Users (Enterprise HIPAA/NIST Industry-Standard Credentials)
        const salt = await bcrypt.genSalt(10);
        const adminPass = await bcrypt.hash('Apex#CpoAdmin2026!', salt);
        const pharmaPass = await bcrypt.hash('Pharma#Lead2026!', salt);
        const storePass = await bcrypt.hash('Store#Lead2026!', salt);
        const nursePass = await bcrypt.hash('Ward#Nurse2026!', salt);
        const cmoPass = await bcrypt.hash('Apex#Cmo2026!', salt);
        await db.query(`
      INSERT INTO users (name, email, password_hash, role, department, branch, avatar_initials, badge) VALUES
      ('Dr. Rajesh Sharma', 'rajesh.sharma@hospital.com', $1, 'Chief Procurement Officer', 'Central Supply Chain', 'Central Warehouse & Main Drug Store', 'RS', 'Admin / CPO'),
      ('Ananya Sen', 'ananya.sen@hospital.com', $2, 'Chief Pharmacist & QC Lead', 'Pharmacy & Cold-Chain', 'Apex Pharmacy & Cold Chain Store', 'AS', 'QC & Pharmacy'),
      ('Vikram Malhotra', 'vikram.malhotra@hospital.com', $3, 'Inventory Operations Lead', 'OT & Critical Care Supply', 'OT & Critical Care Sub-Store', 'VM', 'Store Lead'),
      ('Nurse R. Sharma', 'nurse.sharma@hospital.com', $4, 'Staff Nurse / In-charge', 'ICU Ward', 'Main Campus', 'NS', 'Clinical Staff'),
      ('Dr. S. Patil', 'dr.patil@hospital.com', $5, 'Chief Medical Officer', 'Cardiology & Surgery', 'Apex Hospital', 'SP', 'Clinician')
      ON CONFLICT (email) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        department = EXCLUDED.department,
        branch = EXCLUDED.branch;
    `, [adminPass, pharmaPass, storePass, nursePass, cmoPass]);
        console.log('  Users seeded with industry-standard credentials');
        // 2. Seed Stores
        await db.query(`
      INSERT INTO stores (code, name, branch, store_type) VALUES
      ('STR-CENTRAL', 'Central Warehouse & Main Drug Store', 'Main Campus', 'Central'),
      ('STR-PHARMA', 'Apex Pharmacy & Cold Chain Store', 'Block A', 'Pharmacy'),
      ('STR-ICU', 'ICU Sub-Store & Emergency Stock', 'Trauma Wing', 'ICU'),
      ('STR-OT', 'OT & Critical Care Sub-Store', 'Surgical Block', 'OT'),
      ('STR-WARDS', 'General Wards Dispensing Store', 'Inpatient Tower', 'Wards'),
      ('STR-EMG', 'Emergency & Trauma Triage Store', 'Ground Floor ER', 'Emergency')
      ON CONFLICT (code) DO NOTHING;
    `);
        console.log('  Stores seeded');
        // 3. Seed Vendors
        await db.query(`
      INSERT INTO vendors (vendor_code, name, category, contact_email, phone, score, grade, status, payment_terms) VALUES
      ('VND-2001', 'Aarogya Pharma Distributors', 'Pharmacy', 'orders@aarogya.com', '+91 98201 11223', 94.0, 'A', 'Active', 'Net 30'),
      ('VND-2002', 'Kavach Ortho Implants', 'Implants', 'sales@kavachortho.com', '+91 98202 22334', 88.0, 'B', 'Active', 'Net 45'),
      ('VND-2003', 'Sanjeevani Surgicals', 'Consumables', 'procurement@sanjeevani.com', '+91 98203 33445', 96.0, 'A', 'Active', 'Net 30'),
      ('VND-2004', 'Spectra Bio Reagents', 'Lab Supplies', 'info@spectrabio.com', '+91 98204 44556', 72.0, 'C', 'Suspended', 'Advance'),
      ('VND-2005', 'Prakash Health Supplies', 'Consumables', 'contact@prakashhealth.com', '+91 98205 55667', 90.0, 'A', 'Active', 'Net 30'),
      ('VND-2006', 'Nova MedEquip Traders', 'Capex', 'support@novamedequip.com', '+91 98206 66778', 85.0, 'B', 'Onboarding', 'Net 60'),
      ('VND-2007', 'LifeCare Logistics', 'Services', 'dispatch@lifecare.in', '+91 98207 77889', 82.0, 'B', 'Active', 'Net 15'),
      ('VND-2008', 'Apex Medical Systems', 'Capex', 'care@apexmedical.in', '+91 98208 88990', 95.0, 'A', 'Active', 'Net 30')
      ON CONFLICT (vendor_code) DO NOTHING;
    `);
        console.log('  Vendors seeded');
        // 4. Seed Items
        await db.query(`
      INSERT INTO items (item_code, name, generic_name, category, form, hsn_code, gst_rate, uom, class_vital, schedule_type, is_patient_chargeable, total_on_hand, avg_daily_use, target_cover_days, reorder_level, reorder_qty, last_rate) VALUES
      ('DRG-00412', 'Inj. Ceftriaxone 1 g', 'Ceftriaxone sodium', 'Pharmacy', 'vial', '3004', 12.00, 'vial (box of 10)', 'Vital · A-class', 'Schedule H', true, 1840, 74.00, 24.9, 900, 2000, 38.40),
      ('DRG-00105', 'Inj. Meropenem 1 g', 'Meropenem Trihydrate', 'Pharmacy', 'vial', '3004', 12.00, 'vial', 'Vital · A-class', 'Schedule H1', true, 620, 28.00, 22.1, 300, 1000, 485.00),
      ('CON-00812', 'Surgical Gloves Size 7.5', 'Latex sterile surgical gloves', 'Consumables', 'pair', '4015', 5.00, 'box of 50 pairs', 'Desirable · B-class', 'Non-Rx', false, 8400, 350.00, 24.0, 3000, 10000, 19.40),
      ('CON-00940', 'Suture 2-0 Vicryl Plus', 'Polyglactin 910 with antibacterial', 'Consumables', 'foil pack', '3006', 12.00, 'box of 36 foils', 'Vital · A-class', 'Non-Rx', true, 720, 32.00, 22.5, 400, 800, 249.00),
      ('IMP-00214', 'Bipolar Hip Prosthesis 44mm', 'Modular Stainless Steel Hip Stem', 'Implants', 'set', '9021', 12.00, 'sterile set', 'Vital · A-class', 'Implant Class C', true, 18, 1.20, 15.0, 10, 20, 14200.00),
      ('LAB-00330', 'Hematology Cellpack DCL 20L', 'Diluent for Sysmex Analyzer', 'Lab Supplies', 'can', '3822', 18.00, '20 Litre Drum', 'Essential · B-class', 'Diagnostic Reagent', false, 45, 2.50, 18.0, 20, 50, 4200.00)
      ON CONFLICT (item_code) DO NOTHING;
    `);
        console.log('  Items seeded');
        // 5. Seed Batches (FEFO for Ceftriaxone)
        const ceft = await db.query(`SELECT id FROM items WHERE item_code = 'DRG-00412' LIMIT 1`);
        const ceftId = ceft.rows[0]?.id;
        if (ceftId) {
            await db.query(`
        INSERT INTO batches (item_id, batch_number, bin_location, quantity, expiry_date, mrp, purchase_rate, status) VALUES
        ($1, 'CTX2411A', 'IP Pharmacy · R2-B4', 120, 'Dec 2026', 62.00, 38.40, 'Near expiry'),
        ($1, 'CTX2502C', 'ICU sub-store', 60, 'Feb 2027', 62.00, 38.40, 'Issue first'),
        ($1, 'CTX2505F', 'Central · A1-03', 1200, 'May 2027', 64.50, 38.40, 'Available'),
        ($1, 'CTX2506K', 'Wards (4)', 400, 'Jun 2027', 64.50, 38.40, 'Available'),
        ($1, 'CTX2508B', 'Central · QC hold', 60, 'Aug 2027', 64.50, 38.40, 'QC pending')
      `, [ceftId]);
            console.log('  Batches seeded');
        }
        // 6. Seed Indents
        await db.query(`
      INSERT INTO indents (indent_number, requesting_dept, priority, status, raised_by_name, notes, total_items_count) VALUES
      ('IND-24-1192', 'ICU', 'Emergency', 'Pending', 'Nurse R. Sharma', 'Urgent ICU replenishment post-surgical cases', 14),
      ('IND-24-1191', 'Ward 3', 'Routine', 'Processing', 'Nurse A. Kumar', 'Weekly surgical dressing stock request', 28),
      ('IND-24-1190', 'OT 1', 'Urgent', 'Partially Issued', 'Dr. S. Patil', 'Emergency trauma surgery preparedness kit', 8),
      ('IND-24-1189', 'Emergency Dept', 'Emergency', 'Pending', 'Nurse K. Singh', 'Code blue crash cart refills', 12),
      ('IND-24-1188', 'Pediatrics', 'Routine', 'Completed', 'Nurse M. Devi', 'Pediatric cannulas and IV fluids', 22)
      ON CONFLICT (indent_number) DO NOTHING;
    `);
        console.log('  Indents seeded');
        // 7. Seed Purchase Requests (PR)
        await db.query(`
      INSERT INTO purchase_requests (pr_number, source, department, items_count, estimated_value, status, raised_by_name, remarks) VALUES
      ('PR-24-4092', 'Auto-reorder', 'Pharmacy', 12, 145000.00, 'Pending L1', 'System', 'Threshold breach: Inj. Ceftriaxone & Meropenem'),
      ('PR-24-4091', 'Manual', 'OT', 8, 385000.00, 'Pending CFO', 'Dr. Menon', 'High volume laparoscopy disposable trocars'),
      ('PR-24-4090', 'Indent Escalation', 'Lab', 4, 85000.00, 'Approved', 'Naveen K.', 'Sysmex analyzer reagent replenishment'),
      ('PR-24-4089', 'Auto-reorder', 'General Admin', 25, 42000.00, 'Approved', 'System', 'Sterile packaging pouches quarterly run')
      ON CONFLICT (pr_number) DO NOTHING;
    `);
        console.log('  Purchase Requests seeded');
        // 8. Seed RFQ & Quotes
        await db.query(`
      INSERT INTO rfqs (rfq_number, title, status, closing_date, remarks) VALUES
      ('RFQ-24-0318', 'OT consumables — quarterly rate contract', 'Evaluation', CURRENT_TIMESTAMP + INTERVAL '2 days', '4 vendors invited, 3 quotes submitted')
      ON CONFLICT (rfq_number) DO NOTHING;
    `);
        console.log('  RFQs seeded');
        // 9. Seed Purchase Orders (PO)
        const vnd1 = await db.query(`SELECT id FROM vendors WHERE vendor_code = 'VND-2001' LIMIT 1`);
        const vndId = vnd1.rows[0]?.id || 1;
        await db.query(`
      INSERT INTO purchase_orders (po_number, vendor_id, po_type, items_count, total_value, status, due_date) VALUES
      ('PO-24-1200', $1, 'Rate-contract PO', 18, 420000.00, 'Dispatched', 'In 2 days'),
      ('PO-24-1199', $1, 'Regular PO', 8, 185000.00, 'Overdue', '3 d overdue'),
      ('PO-24-1198', $1, 'Blanket PO', 14, 290000.00, 'Accepted', 'In 4 days'),
      ('PO-24-1197', $1, 'Emergency purchase', 4, 95000.00, 'Awaiting approval', 'In 1 day'),
      ('PO-24-1196', $1, 'Capex PO', 2, 1420000.00, 'Draft', 'Pending approval')
      ON CONFLICT (po_number) DO NOTHING;
    `, [vndId]);
        console.log('  Purchase Orders seeded');
        // 10. Seed GRNs
        await db.query(`
      INSERT INTO grns (grn_number, po_ref, vendor_id, lines_count, shortage_notes, received_date, status, inspector_name) VALUES
      ('GRN-24-880', 'PO-24-1200', $1, 14, '-', 'Today', 'Expected', 'Inspector Anil V.'),
      ('GRN-24-879', 'PO-24-1199', $1, 8, '-', 'Yesterday', 'Pending QC', 'Ananya Sen'),
      ('GRN-24-878', 'PO-24-1198', $1, 20, '-', '2 days ago', 'QC Passed', 'Ananya Sen'),
      ('GRN-24-877', 'PO-24-1195', $1, 6, '2 boxes short seal damaged', '3 days ago', 'Partial Reject', 'Inspector Anil V.')
      ON CONFLICT (grn_number) DO NOTHING;
    `, [vndId]);
        console.log('  GRNs seeded');
        // 11. Seed Stock Transfers
        await db.query(`
      INSERT INTO stock_transfers (transfer_number, transfer_type, from_location, to_location, lines_count, status, issued_by_name) VALUES
      ('TRF-24-3392', 'Ward Issue', 'Main Store', 'ICU Ward', 12, 'Completed', 'Vikram Malhotra'),
      ('TRF-24-3391', 'Store Transfer', 'Pharmacy', 'OT Store', 6, 'In Transit', 'Ananya Sen'),
      ('TRF-24-3390', 'Patient Issue', 'Pharmacy', 'Patient #8892', 3, 'Completed', 'Pharma Staff'),
      ('TRF-24-3389', 'Ward Return', 'General Ward A', 'Main Store', 2, 'Pending', 'Nurse P. Nair')
      ON CONFLICT (transfer_number) DO NOTHING;
    `);
        console.log('  Stock Transfers seeded');
        // 12. Seed Invoices
        await db.query(`
      INSERT INTO invoices (invoice_number, po_ref, vendor_id, amount, due_date, status) VALUES
      ('INV-24-4090', 'PO-24-1199', $1, 185000.00, 'In 5 days', 'Pending'),
      ('INV-24-4089', 'PO-24-1198', $1, 290000.00, '4 d overdue', 'Overdue'),
      ('INV-24-4088', 'PO-24-1196', $1, 142000.00, 'Settled', 'Paid'),
      ('INV-24-4087', 'PO-24-1194', $1, 74000.00, 'Pending match', 'Pending GRN')
      ON CONFLICT (invoice_number) DO NOTHING;
    `, [vndId]);
        console.log('  Invoices seeded');
        // 13. Seed Assets
        await db.query(`
      INSERT INTO assets (asset_tag, name, serial_no, department, vendor_name, amc_expiry, amc_alert, status, purchase_cost) VALUES
      ('AST-24-1000', 'MRI Scanner 1.5T (Unit 1)', 'SN-0012E4FA', 'Radiology', 'Siemens Healthineers', 'Valid for 180 days', false, 'Active', 8500000.00),
      ('AST-24-1001', 'Ventilator V60 Plus (Unit 3)', 'SN-0024B11C', 'ICU', 'Philips Healthcare', 'Expires in 4 days', true, 'In Maintenance', 1450000.00),
      ('AST-24-1002', 'Surgical Table Pro (OT 2)', 'SN-0036C99D', 'Operation Theatre', 'Apex Medical Systems', 'Valid for 90 days', false, 'Active', 920000.00),
      ('AST-24-1003', 'Hematology 5-Part Analyzer', 'SN-0048D22E', 'Pathology Lab', 'Sysmex India', 'Valid for 240 days', false, 'Active', 1850000.00)
      ON CONFLICT (asset_tag) DO NOTHING;
    `);
        console.log('  Assets seeded');
        // 14. Seed Reports
        await db.query(`
      INSERT INTO reports (report_code, name, report_type, file_size, generated_date) VALUES
      ('RPT-8442', 'Q3 Vendor Performance Analysis', 'Vendor Management', '2.4 MB', 'Oct 08, 2024'),
      ('RPT-8441', 'Monthly Inventory Valuation', 'Inventory', '1.1 MB', 'Oct 01, 2024'),
      ('RPT-8440', 'AP Aging Summary', 'Finance', '840 KB', 'Sep 30, 2024'),
      ('RPT-8439', 'Departmental Consumption Rate', 'Analytics', '3.2 MB', 'Sep 28, 2024'),
      ('RPT-8438', 'AMC Expiry Forecast (Q4)', 'Assets', '1.5 MB', 'Sep 25, 2024')
      ON CONFLICT (report_code) DO NOTHING;
    `);
        console.log('  Reports seeded');
        console.log('✅ [PostgreSQL Seeder]: Successfully seeded all tables with CRM demo data!');
    }
    catch (error) {
        console.error('❌ [PostgreSQL Seeder Failed]:', error);
        throw error;
    }
}
// If run directly via tsx or node dist/db/seed.js
if (process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))) {
    seedDatabase()
        .then(async () => {
        await pool.end();
        process.exit(0);
    })
        .catch(async () => {
        await pool.end();
        process.exit(1);
    });
}
