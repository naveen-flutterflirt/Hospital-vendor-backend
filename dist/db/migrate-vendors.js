import { db, pool } from '../config/db.js';
export async function migrateVendorsModule() {
    console.log('🏥 [PostgreSQL Migration]: Starting Vendor Management module migration...');
    try {
        const conn = await db.checkConnection();
        if (!conn.connected) {
            throw new Error(`Failed to connect to PostgreSQL: ${conn.error}`);
        }
        // 1. Extend vendors table with compliance & banking columns
        await db.query(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS gstin VARCHAR(50),
      ADD COLUMN IF NOT EXISTS pan VARCHAR(50),
      ADD COLUMN IF NOT EXISTS compliance_documents JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS notes TEXT;

      CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
      CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);
      CREATE INDEX IF NOT EXISTS idx_vendors_score ON vendors(score DESC);
      CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(vendor_code);
    `);
        console.log('✅ vendors table schema upgraded with compliance columns & indexes.');
        // 2. Check existing count of vendors
        const countRes = await db.query('SELECT COUNT(*)::INTEGER as count FROM vendors');
        const existingCount = Number(countRes.rows[0]?.count || 0);
        console.log(`ℹ️ Existing vendors count: ${existingCount}`);
        // If less than 40 vendors, populate the complete realistic formulary
        if (existingCount < 40) {
            console.log('🌱 Seeding complete realistic hospital vendors formulary...');
            // Base vendor profiles matching frontend mock template
            const baseVendors = [
                { name: 'Aarogya Pharma Distributors', cat: 'Pharmacy', score: 94, grade: 'A', status: 'Active' },
                { name: 'Kavach Ortho Implants', cat: 'Implants', score: 88, grade: 'B', status: 'Active' },
                { name: 'Sanjeevani Surgicals', cat: 'Consumables', score: 96, grade: 'A', status: 'Active' },
                { name: 'Spectra Bio Reagents', cat: 'Lab Supplies', score: 72, grade: 'C', status: 'Suspended' },
                { name: 'Prakash Health Supplies', cat: 'Consumables', score: 90, grade: 'A', status: 'Active' },
                { name: 'Nova MedEquip Traders', cat: 'Capex', score: null, grade: 'Unrated', status: 'Onboarding' },
                { name: 'LifeCare Logistics', cat: 'Services', score: 82, grade: 'B', status: 'Active' },
                { name: 'Apex Medical Systems', cat: 'Capex', score: 95, grade: 'A', status: 'Active' },
            ];
            // Additional realistic Indian healthcare suppliers
            const extraNames = [
                { name: 'Cipla Critical Care Solutions', cat: 'Pharmacy' },
                { name: 'Sun Pharma Specialities', cat: 'Pharmacy' },
                { name: 'Glenmark Life Formulary', cat: 'Pharmacy' },
                { name: 'Dr. Reddy Emergency Drugs', cat: 'Pharmacy' },
                { name: 'Cadila Biologicals', cat: 'Pharmacy' },
                { name: 'B. Braun India Surgicals', cat: 'Consumables' },
                { name: 'Sutures India Private Ltd', cat: 'Consumables' },
                { name: 'Poly Medicure Devices', cat: 'Consumables' },
                { name: 'HMD Syringes & Needles', cat: 'Consumables' },
                { name: 'Romsons Medical Supplies', cat: 'Consumables' },
                { name: 'Stryker Trauma Implants', cat: 'Implants' },
                { name: 'Zimmer Biomet Joint Systems', cat: 'Implants' },
                { name: 'Smith & Nephew Ortho', cat: 'Implants' },
                { name: 'Medtronic Cardiovascular', cat: 'Implants' },
                { name: 'Philips Healthcare Bio-Med', cat: 'Capex' },
                { name: 'GE Healthcare Diagnostic Systems', cat: 'Capex' },
                { name: 'Siemens Healthineers India', cat: 'Capex' },
                { name: 'Mindray Patient Monitors', cat: 'Capex' },
                { name: 'Transasia Bio-Medicals', cat: 'Lab Supplies' },
                { name: 'Roche Diagnostics India', cat: 'Lab Supplies' },
                { name: 'Abbott Diagnostics Formulations', cat: 'Lab Supplies' },
                { name: 'Bio-Rad Laboratories', cat: 'Lab Supplies' },
                { name: 'SteriClean Hospital Sterilization', cat: 'Services' },
                { name: 'BioClean Linen & Laundry Systems', cat: 'Services' },
                { name: 'MediWaste Eco Safe Disposal', cat: 'Services' },
            ];
            // Generate 199 vendors:
            // Active: 184 (with exactly 45 Top Performers >= 90 score)
            // Onboarding: 12
            // Suspended: 3
            const targetVendors = [];
            let topPerformerCount = 0;
            let onboardingCount = 0;
            let suspendedCount = 0;
            for (let i = 0; i < 199; i++) {
                const code = `VND-${2000 + i}`;
                let base = baseVendors[i % baseVendors.length];
                if (i >= 42) {
                    const extra = extraNames[i % extraNames.length];
                    base = {
                        name: `${extra.name} ${Math.floor(i / extraNames.length) + 1}`,
                        cat: extra.cat,
                        score: 85,
                        grade: 'B',
                        status: 'Active',
                    };
                }
                const name = i < 8 ? base.name : `${base.name.replace(/\s\d+$/, '')} ${Math.floor(i / 8) + 1}`;
                const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
                const email = `contact@${cleanSlug}.com`;
                const phone = `+91 ${98000 + (i % 1000)} ${10000 + ((i * 13) % 90000)}`;
                const gstin = `27${String.fromCharCode(65 + (i % 26))}ABCDE${1000 + i}F1Z${i % 9}`;
                const pan = `${String.fromCharCode(65 + (i % 26))}ABCDE${1000 + i}F`;
                let status = 'Active';
                let score = null;
                let grade = 'Unrated';
                // Distribution to match: Suspended: 3, Onboarding: 12, Active: 184 (45 with score >= 90)
                if (suspendedCount < 3 && (i === 3 || i === 24 || i === 52)) {
                    status = 'Suspended';
                    score = 68 + (i % 8);
                    grade = 'C';
                    suspendedCount++;
                }
                else if (onboardingCount < 12 && (i === 5 || i % 16 === 5)) {
                    status = 'Onboarding';
                    score = null;
                    grade = 'Unrated';
                    onboardingCount++;
                }
                else {
                    status = 'Active';
                    if (topPerformerCount < 45) {
                        score = 90 + ((i * 3) % 9); // 90 to 98
                        grade = 'A';
                        topPerformerCount++;
                    }
                    else {
                        score = 80 + ((i * 5) % 9); // 80 to 88
                        grade = 'B';
                    }
                }
                targetVendors.push({
                    code,
                    name,
                    category: base.cat,
                    email,
                    phone,
                    gstin,
                    pan,
                    score,
                    grade,
                    status,
                    paymentTerms: i % 2 === 0 ? 'Net 30' : 'Net 45',
                });
            }
            console.log(`Generated ${targetVendors.length} target vendors (Top Performers: ${topPerformerCount}, Onboarding: ${onboardingCount}, Suspended: ${suspendedCount})`);
            for (const v of targetVendors) {
                await db.query(`
          INSERT INTO vendors (
            vendor_code, name, category, contact_email, phone,
            gstin, pan, score, grade, status, payment_terms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (vendor_code) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            contact_email = EXCLUDED.contact_email,
            phone = EXCLUDED.phone,
            gstin = EXCLUDED.gstin,
            pan = EXCLUDED.pan,
            score = EXCLUDED.score,
            grade = EXCLUDED.grade,
            status = EXCLUDED.status,
            payment_terms = EXCLUDED.payment_terms;
        `, [
                    v.code, v.name, v.category, v.email, v.phone,
                    v.gstin, v.pan, v.score, v.grade, v.status, v.paymentTerms
                ]);
            }
            console.log('✅ Realistic vendors data seeded successfully.');
        }
        else {
            console.log('✅ Adequate vendors data already present. Skipping bulk insertion.');
        }
        // 3. Output current metrics summary
        const kpiCheck = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Active')::INTEGER as active_count,
        COUNT(*) FILTER (WHERE status = 'Onboarding')::INTEGER as onboarding_count,
        COUNT(*) FILTER (WHERE status = 'Active' AND score >= 90.0)::INTEGER as top_performers_count,
        COUNT(*) FILTER (WHERE status = 'Suspended')::INTEGER as suspended_count,
        COUNT(*)::INTEGER as total_count
      FROM vendors;
    `);
        console.log('📊 Current Vendor Metrics in PostgreSQL:');
        console.table(kpiCheck.rows[0]);
    }
    catch (error) {
        console.error('❌ [PostgreSQL Migration Failed]:', error);
        throw error;
    }
}
if (process.argv[1] && (process.argv[1].endsWith('migrate-vendors.ts') || process.argv[1].endsWith('migrate-vendors.js'))) {
    migrateVendorsModule()
        .then(async () => {
        await pool.end();
        process.exit(0);
    })
        .catch(async () => {
        await pool.end();
        process.exit(1);
    });
}
