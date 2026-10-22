import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
export class CrmController {
    // Vendors
    static async getVendors(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM vendors ORDER BY id ASC');
            return ApiResponse.success(res, result.rows, 'Vendors fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    static async createVendor(req, res, next) {
        try {
            const { vendor_code, name, category, contact_email, phone, score, grade, status, payment_terms } = req.body;
            const result = await db.query(`INSERT INTO vendors (vendor_code, name, category, contact_email, phone, score, grade, status, payment_terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [vendor_code || `VND-${Date.now().toString().slice(-4)}`, name, category || 'Pharmacy', contact_email, phone, score || 90, grade || 'A', status || 'Active', payment_terms || 'Net 30']);
            return ApiResponse.created(res, result.rows[0], 'Vendor created successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Items / Inventory
    static async getItems(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM items ORDER BY id ASC');
            return ApiResponse.success(res, result.rows, 'Items fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Purchase Orders
    static async getPurchaseOrders(_req, res, next) {
        try {
            const result = await db.query(`
        SELECT po.*, v.name as vendor_name 
        FROM purchase_orders po 
        LEFT JOIN vendors v ON po.vendor_id = v.id 
        ORDER BY po.id DESC
      `);
            return ApiResponse.success(res, result.rows, 'Purchase orders fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Indents
    static async getIndents(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM indents ORDER BY id DESC');
            return ApiResponse.success(res, result.rows, 'Indents fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Purchase Requests
    static async getPurchaseRequests(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM purchase_requests ORDER BY id DESC');
            return ApiResponse.success(res, result.rows, 'Purchase requests fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // GRN
    static async getGRNs(_req, res, next) {
        try {
            const result = await db.query(`
        SELECT g.*, v.name as vendor_name, po.po_number 
        FROM grns g 
        LEFT JOIN vendors v ON g.vendor_id = v.id 
        LEFT JOIN purchase_orders po ON g.po_id = po.id 
        ORDER BY g.id DESC
      `);
            return ApiResponse.success(res, result.rows, 'GRNs fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Stock Transfers & Issues
    static async getStockTransfers(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM stock_transfers ORDER BY id DESC');
            return ApiResponse.success(res, result.rows, 'Stock transfers fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Invoices & Payments
    static async getInvoices(_req, res, next) {
        try {
            const result = await db.query(`
        SELECT inv.*, v.name as vendor_name, po.po_number 
        FROM invoices inv 
        LEFT JOIN vendors v ON inv.vendor_id = v.id 
        LEFT JOIN purchase_orders po ON inv.po_id = po.id 
        ORDER BY inv.id DESC
      `);
            return ApiResponse.success(res, result.rows, 'Invoices fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Assets & AMC
    static async getAssets(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM assets ORDER BY id ASC');
            return ApiResponse.success(res, result.rows, 'Assets fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Reports
    static async getReports(_req, res, next) {
        try {
            const result = await db.query('SELECT * FROM reports ORDER BY id ASC');
            return ApiResponse.success(res, result.rows, 'Reports fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Stores
    static async getStores(_req, res, next) {
        try {
            const result = await db.query(`
        SELECT 
          s.id,
          s.code,
          s.name,
          s.branch,
          s.store_type,
          s.is_active,
          COUNT(DISTINCT b.item_id)::INTEGER as items_count,
          COUNT(b.id)::INTEGER as batches_count,
          COALESCE(SUM(b.quantity), 0)::INTEGER as total_stock,
          COALESCE(MAX(u.name), 'Store In-Charge') as manager_name
        FROM stores s
        LEFT JOIN batches b ON b.store_id = s.id
        LEFT JOIN users u ON u.branch = s.name
        WHERE s.is_active = true
        GROUP BY s.id, s.code, s.name, s.branch, s.store_type, s.is_active
        ORDER BY s.id ASC;
      `);
            return ApiResponse.success(res, result.rows, 'Stores fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    // Universal Barcode & Medication / Inbound Consignment Scanner
    static async lookupBarcode(req, res, next) {
        try {
            const rawInput = (req.body.query || req.body.barcode || '').trim();
            if (!rawInput) {
                return ApiResponse.error(res, 'Barcode or search query is required', 400);
            }
            // GS1 standard parser: extract GTIN (01), Expiry (17), Batch (10), Serial (21)
            let gtin = '';
            let expiry = '';
            let batch = '';
            let serial = '';
            if (rawInput.includes('(01)') || rawInput.includes('(10)')) {
                const gtinMatch = rawInput.match(/\(01\)(\d{14})/);
                const expMatch = rawInput.match(/\(17\)(\d{6})/);
                const batchMatch = rawInput.match(/\(10\)([a-zA-Z0-9_-]+)/);
                const serialMatch = rawInput.match(/\(21\)([a-zA-Z0-9_-]+)/);
                if (gtinMatch)
                    gtin = gtinMatch[1];
                if (expMatch) {
                    const rawExp = expMatch[1];
                    expiry = `20${rawExp.slice(0, 2)}-${rawExp.slice(2, 4)}-${rawExp.slice(4, 6)}`;
                }
                if (batchMatch)
                    batch = batchMatch[1];
                if (serialMatch)
                    serial = serialMatch[1];
            }
            const cleanQuery = batch || rawInput.replace(/[()]/g, ' ').trim();
            // 1. Check if matches a Batch
            const batchQuery = `
        SELECT 
          b.id as batch_id,
          b.batch_number,
          b.quantity as batch_quantity,
          b.expiry_date,
          b.bin_location,
          b.status as batch_status,
          b.purchase_rate,
          b.mrp,
          b.vendor_name,
          s.id as store_id,
          COALESCE(s.name, 'Central Warehouse & Main Drug Store') as store_name,
          s.branch as store_branch,
          i.id as item_id,
          i.item_code,
          i.name as item_name,
          i.generic_name,
          i.category,
          i.form,
          i.uom,
          i.class_vital,
          i.schedule_type,
          i.total_on_hand,
          i.avg_daily_use,
          i.target_cover_days,
          i.reorder_level,
          i.last_rate
        FROM batches b
        JOIN items i ON b.item_id = i.id
        LEFT JOIN stores s ON b.store_id = s.id
        WHERE b.batch_number ILIKE $1 OR b.batch_number ILIKE $2
        ORDER BY b.id ASC
        LIMIT 1;
      `;
            const batchRes = await db.query(batchQuery, [cleanQuery, `%${cleanQuery}%`]);
            if (batchRes.rows.length > 0) {
                const row = batchRes.rows[0];
                // Fetch all batches for this item to show stock breakdown
                const allBatchesRes = await db.query(`
          SELECT 
            b.id, b.batch_number, b.quantity, b.expiry_date, b.bin_location, 
            b.status, b.purchase_rate, b.mrp,
            s.id as store_id, COALESCE(s.name, 'Central Store') as store_name
          FROM batches b
          LEFT JOIN stores s ON b.store_id = s.id
          WHERE b.item_id = $1
          ORDER BY b.expiry_date ASC;
        `, [row.item_id]);
                return ApiResponse.success(res, {
                    matchType: 'batch',
                    matchedBatch: {
                        id: row.batch_id,
                        batchNumber: row.batch_number,
                        quantity: row.batch_quantity,
                        expiryDate: row.expiry_date,
                        binLocation: row.bin_location,
                        status: row.batch_status,
                        purchaseRate: row.purchase_rate,
                        mrp: row.mrp,
                        vendorName: row.vendor_name,
                        storeId: row.store_id,
                        storeName: row.store_name,
                        storeBranch: row.store_branch,
                    },
                    item: {
                        id: row.item_id,
                        itemCode: row.item_code,
                        name: row.item_name,
                        genericName: row.generic_name,
                        category: row.category,
                        form: row.form,
                        uom: row.uom,
                        classVital: row.class_vital,
                        scheduleType: row.schedule_type,
                        totalOnHand: row.total_on_hand,
                        avgDailyUse: row.avg_daily_use,
                        targetCoverDays: row.target_cover_days,
                        reorderLevel: row.reorder_level,
                        lastRate: row.last_rate,
                    },
                    batches: allBatchesRes.rows.map(b => ({
                        id: b.id,
                        batchNumber: b.batch_number,
                        quantity: b.quantity,
                        expiryDate: b.expiry_date,
                        binLocation: b.bin_location,
                        status: b.status,
                        storeId: b.store_id,
                        storeName: b.store_name,
                    })),
                    scannedMeta: {
                        rawBarcode: rawInput,
                        gtin,
                        batch: batch || row.batch_number,
                        expiry: expiry || row.expiry_date,
                        serial,
                    }
                }, `Found matching medication batch ${row.batch_number}`);
            }
            // 2. Check if matches an Item (by item_code, name, generic_name, or GTIN)
            const itemQuery = `
        SELECT 
          id, item_code, name, generic_name, category, form, uom, 
          class_vital, schedule_type, total_on_hand, avg_daily_use, 
          target_cover_days, reorder_level, last_rate, rate_contract_expiry
        FROM items
        WHERE item_code ILIKE $1 
           OR name ILIKE $1 
           OR generic_name ILIKE $1
           OR item_code ILIKE $2
           OR name ILIKE $2
        ORDER BY id ASC
        LIMIT 1;
      `;
            const itemRes = await db.query(itemQuery, [cleanQuery, `%${cleanQuery}%`]);
            if (itemRes.rows.length > 0) {
                const it = itemRes.rows[0];
                // Fetch batches for this item
                const batchesRes = await db.query(`
          SELECT 
            b.id, b.batch_number, b.quantity, b.expiry_date, b.bin_location, 
            b.status, b.purchase_rate, b.mrp, b.vendor_name,
            s.id as store_id, COALESCE(s.name, 'Central Store') as store_name
          FROM batches b
          LEFT JOIN stores s ON b.store_id = s.id
          WHERE b.item_id = $1
          ORDER BY b.expiry_date ASC;
        `, [it.id]);
                return ApiResponse.success(res, {
                    matchType: 'item',
                    item: {
                        id: it.id,
                        itemCode: it.item_code,
                        name: it.name,
                        genericName: it.generic_name,
                        category: it.category,
                        form: it.form,
                        uom: it.uom,
                        classVital: it.class_vital,
                        scheduleType: it.schedule_type,
                        totalOnHand: it.total_on_hand,
                        avgDailyUse: it.avg_daily_use,
                        targetCoverDays: it.target_cover_days,
                        reorderLevel: it.reorder_level,
                        lastRate: it.last_rate,
                        rateContractExpiry: it.rate_contract_expiry,
                    },
                    batches: batchesRes.rows.map(b => ({
                        id: b.id,
                        batchNumber: b.batch_number,
                        quantity: b.quantity,
                        expiryDate: b.expiry_date,
                        binLocation: b.bin_location,
                        status: b.status,
                        storeId: b.store_id,
                        storeName: b.store_name,
                        purchaseRate: b.purchase_rate,
                        mrp: b.mrp,
                        vendorName: b.vendor_name,
                    })),
                    scannedMeta: {
                        rawBarcode: rawInput,
                        gtin,
                        batch,
                        expiry,
                        serial,
                    }
                }, `Found formulary item ${it.name}`);
            }
            // 3. Check if matches a Purchase Order
            const poRes = await db.query(`
        SELECT po.id, po.po_number, po.vendor_id, v.name as vendor_name, po.status, 
               po.total_amount, po.delivery_date, po.created_at
        FROM purchase_orders po
        LEFT JOIN vendors v ON po.vendor_id = v.id
        WHERE po.po_number ILIKE $1 OR po.po_number ILIKE $2
        LIMIT 1;
      `, [cleanQuery, `%${cleanQuery}%`]);
            if (poRes.rows.length > 0) {
                const po = poRes.rows[0];
                const poItems = await db.query(`SELECT * FROM po_items WHERE po_id = $1;`, [po.id]);
                return ApiResponse.success(res, {
                    matchType: 'po',
                    po: {
                        id: po.id,
                        poNumber: po.po_number,
                        vendorName: po.vendor_name,
                        status: po.status,
                        totalAmount: po.total_amount,
                        deliveryDate: po.delivery_date,
                        items: poItems.rows,
                    },
                    scannedMeta: {
                        rawBarcode: rawInput,
                    }
                }, `Found Purchase Order ${po.po_number}`);
            }
            // 4. Check if matches a Biomedical Asset
            const assetRes = await db.query(`
        SELECT * FROM assets 
        WHERE asset_code ILIKE $1 OR serial_number ILIKE $1 OR asset_code ILIKE $2 OR serial_number ILIKE $2
        LIMIT 1;
      `, [cleanQuery, `%${cleanQuery}%`]);
            if (assetRes.rows.length > 0) {
                const asset = assetRes.rows[0];
                return ApiResponse.success(res, {
                    matchType: 'asset',
                    asset,
                    scannedMeta: {
                        rawBarcode: rawInput,
                    }
                }, `Found Biomedical Equipment ${asset.name}`);
            }
            // Fallback: Not Found
            return ApiResponse.success(res, {
                matchType: 'not_found',
                scannedMeta: {
                    rawBarcode: rawInput,
                    gtin,
                    batch,
                    expiry,
                    serial,
                }
            }, `No direct database record matched "${rawInput}". Ready for Inbound Delivery Check-in.`);
        }
        catch (err) {
            next(err);
        }
    }
}
