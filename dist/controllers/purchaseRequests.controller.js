import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';
function getPrStatusClass(status) {
    switch (status) {
        case 'Pending L1':
        case 'Pending CFO':
            return 'bg-[#E89A3C]/10 text-[#E89A3C]';
        case 'Approved':
            return 'bg-[#1EB4A1]/20 text-[#127670]';
        case 'Rejected':
            return 'bg-[#D94432]/10 text-[#D94432]';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}
function calculateAge(date) {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0)
        return 'Today';
    if (diffDays === 1)
        return '1 day ago';
    return `${diffDays} days ago`;
}
const prItemSchema = z.object({
    itemId: z.number().optional().nullable(),
    itemName: z.string().optional().default(''),
    itemCode: z.string().optional().default(''),
    quantity: z.number().optional(),
    requestedQuantity: z.number().optional(),
    unitRate: z.number().optional(),
    estimatedCost: z.number().optional(),
    uom: z.string().optional().default('units'),
    remarks: z.string().optional(),
});
const createPrSchema = z.object({
    department: z.string().optional(),
    dept: z.string().optional(),
    purchaseType: z.string().optional().default('Regular PO'),
    priority: z.string().optional().default('Routine'),
    source: z.string().optional().default('Manual'),
    remarks: z.string().optional(),
    justification: z.string().optional(),
    items: z.array(prItemSchema).min(1, 'At least one item is required in the purchase request'),
});
const updatePrStatusSchema = z.object({
    status: z.enum(['Pending L1', 'Pending CFO', 'Approved', 'Rejected']),
    approvedBy: z.string().optional(),
    rejectionReason: z.string().optional(),
    remarks: z.string().optional(),
});
export class PurchaseRequestsController {
    /**
     * GET /api/v1/purchase-requests/kpis
     * Dynamic KPI metrics computed directly from database
     */
    static async getKpis(_req, res, next) {
        try {
            const kpisQuery = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status IN ('Pending L1', 'Pending CFO')) AS pending_approval,
          COUNT(*) FILTER (WHERE estimated_value >= 200000.00) AS over_budget,
          COUNT(*) FILTER (WHERE status = 'Approved') AS approved_ready,
          COUNT(*) FILTER (WHERE status = 'Rejected') AS rejected_count,
          COALESCE(SUM(estimated_value) FILTER (WHERE status IN ('Pending L1', 'Pending CFO')), 0) AS pending_value,
          COALESCE(SUM(estimated_value) FILTER (WHERE status = 'Approved'), 0) AS approved_value
        FROM purchase_requests;
      `);
            const stats = kpisQuery.rows[0];
            const kpis = [
                {
                    id: 'pending',
                    label: 'Pending Approval',
                    value: stats.pending_approval || '0',
                    sub: `₹${(parseFloat(stats.pending_value) / 100000).toFixed(1)}L in pipeline`,
                    alert: parseInt(stats.pending_approval, 10) > 10,
                },
                {
                    id: 'over_budget',
                    label: 'Over Budget',
                    value: stats.over_budget || '0',
                    sub: 'Needs CFO / Board review',
                    alert: parseInt(stats.over_budget, 10) > 0,
                },
                {
                    id: 'approved',
                    label: 'Approved (Ready)',
                    value: stats.approved_ready || '0',
                    sub: 'Awaiting PO / RFQ issue',
                    alert: false,
                },
                {
                    id: 'rejected',
                    label: 'Rejected',
                    value: stats.rejected_count || '0',
                    sub: 'Audit logged',
                    alert: false,
                },
            ];
            return ApiResponse.success(res, kpis, 'Purchase request KPIs fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/purchase-requests/lookups
     * Master data lookups for departments, formulary items, purchase types
     */
    static async getLookups(_req, res, next) {
        try {
            // 1. Available departments
            const deptsQuery = await db.query(`
        SELECT DISTINCT department FROM purchase_requests ORDER BY department ASC;
      `);
            const defaultDepts = ['Pharmacy', 'OT', 'Lab', 'Radiology', 'ICU', 'General Admin', 'Cardiology', 'Dialysis', 'Orthopedics', 'Central Store'];
            const dbDepts = deptsQuery.rows.map(r => r.department);
            const allDepts = Array.from(new Set([...defaultDepts, ...dbDepts]));
            // 2. Formulary items from items table
            const itemsQuery = await db.query(`
        SELECT id, item_code, name, category, uom, last_rate, total_on_hand, reorder_level 
        FROM items 
        ORDER BY name ASC 
        LIMIT 100;
      `);
            const lookups = {
                departments: allDepts,
                purchaseTypes: ['Regular PO', 'Rate Contract', 'Emergency'],
                priorities: ['Routine', 'Urgent', 'Emergency'],
                sources: ['Manual', 'Auto-reorder', 'Indent Escalation'],
                statuses: ['Pending L1', 'Pending CFO', 'Approved', 'Rejected'],
                items: itemsQuery.rows.map(it => ({
                    id: it.id,
                    itemCode: it.item_code,
                    name: it.name,
                    category: it.category,
                    uom: it.uom,
                    unitRate: parseFloat(it.last_rate || '0'),
                    stockOnHand: it.total_on_hand,
                })),
            };
            return ApiResponse.success(res, lookups, 'Lookups fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/purchase-requests
     * Paginated, searchable, filtered PR list
     */
    static async getPurchaseRequests(req, res, next) {
        try {
            const page = Math.max(1, parseInt(req.query.page || '1', 10));
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));
            const offset = (page - 1) * limit;
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const department = (req.query.department || '').trim();
            const source = (req.query.source || '').trim();
            const sortBy = (req.query.sortBy || 'created_at').trim();
            const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            const conditions = [];
            const params = [];
            let paramIndex = 1;
            if (search) {
                conditions.push(`(
          pr.pr_number ILIKE $${paramIndex} OR 
          pr.department ILIKE $${paramIndex} OR 
          pr.raised_by_name ILIKE $${paramIndex} OR 
          pr.remarks ILIKE $${paramIndex}
        )`);
                params.push(`%${search}%`);
                paramIndex++;
            }
            if (status && status !== 'All') {
                conditions.push(`pr.status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }
            if (department && department !== 'All') {
                conditions.push(`pr.department = $${paramIndex}`);
                params.push(department);
                paramIndex++;
            }
            if (source && source !== 'All') {
                conditions.push(`pr.source = $${paramIndex}`);
                params.push(source);
                paramIndex++;
            }
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            // Count query
            const countResult = await db.query(`SELECT COUNT(*) FROM purchase_requests pr ${whereClause};`, params);
            const total = parseInt(countResult.rows[0].count, 10);
            const totalPages = Math.ceil(total / limit);
            // Validate sortBy column to prevent SQL injection
            const allowedSortColumns = {
                id: 'pr.id',
                pr_number: 'pr.pr_number',
                department: 'pr.department',
                items_count: 'pr.items_count',
                estimated_value: 'pr.estimated_value',
                status: 'pr.status',
                created_at: 'pr.created_at',
            };
            const sortColumn = allowedSortColumns[sortBy] || 'pr.created_at';
            // Data query
            const dataQuery = `
        SELECT 
          pr.id,
          pr.pr_number,
          pr.source,
          pr.department,
          pr.purchase_type,
          pr.priority,
          pr.items_count,
          pr.estimated_value,
          pr.status,
          pr.raised_by_name,
          pr.approved_by,
          pr.approved_at,
          pr.rejection_reason,
          pr.converted_to_po,
          pr.converted_to_rfq,
          pr.remarks,
          pr.created_at,
          pr.updated_at
        FROM purchase_requests pr
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
      `;
            params.push(limit, offset);
            const result = await db.query(dataQuery, params);
            const formatted = result.rows.map((row) => {
                const estNum = parseFloat(row.estimated_value);
                let estValueFormatted = `₹${(estNum / 100000).toFixed(1)}L`;
                if (estNum < 100000) {
                    estValueFormatted = `₹${estNum.toLocaleString('en-IN')}`;
                }
                return {
                    id: row.id,
                    prNumber: row.pr_number,
                    source: row.source,
                    department: row.department,
                    purchaseType: row.purchase_type || 'Regular PO',
                    priority: row.priority || 'Routine',
                    itemsCount: row.items_count,
                    estimatedValue: estNum,
                    estimatedValueFormatted: estValueFormatted,
                    status: row.status,
                    statusClass: getPrStatusClass(row.status),
                    raisedBy: row.raised_by_name,
                    approvedBy: row.approved_by,
                    approvedAt: row.approved_at,
                    rejectionReason: row.rejection_reason,
                    convertedToPo: row.converted_to_po,
                    convertedToRfq: row.converted_to_rfq,
                    remarks: row.remarks,
                    createdAt: row.created_at,
                    age: calculateAge(row.created_at),
                };
            });
            return ApiResponse.success(res, {
                purchaseRequests: formatted,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                },
            }, 'Purchase requests fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/purchase-requests/:id
     * Detailed PR view with item lines
     */
    static async getPrById(req, res, next) {
        try {
            const id = req.params.id;
            const isNumeric = /^\d+$/.test(id);
            const prQuery = isNumeric
                ? await db.query('SELECT * FROM purchase_requests WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM purchase_requests WHERE pr_number = $1 LIMIT 1;', [id]);
            if (prQuery.rows.length === 0) {
                throw new AppError('Purchase request not found', 404);
            }
            const pr = prQuery.rows[0];
            // Fetch line items
            const itemsQuery = await db.query(`
        SELECT 
          pri.id,
          pri.pr_id,
          pri.item_id,
          pri.item_name,
          pri.item_code,
          pri.quantity,
          pri.uom,
          pri.estimated_unit_rate,
          pri.total_amount,
          i.category,
          i.total_on_hand
        FROM purchase_request_items pri
        LEFT JOIN items i ON pri.item_id = i.id
        WHERE pri.pr_id = $1
        ORDER BY pri.id ASC;
      `, [pr.id]);
            const estNum = parseFloat(pr.estimated_value);
            const estValueFormatted = estNum >= 100000
                ? `₹${(estNum / 100000).toFixed(2)} Lakhs`
                : `₹${estNum.toLocaleString('en-IN')}`;
            return ApiResponse.success(res, {
                id: pr.id,
                prNumber: pr.pr_number,
                source: pr.source,
                department: pr.department,
                purchaseType: pr.purchase_type || 'Regular PO',
                priority: pr.priority || 'Routine',
                itemsCount: pr.items_count,
                estimatedValue: estNum,
                estimatedValueFormatted: estValueFormatted,
                status: pr.status,
                statusClass: getPrStatusClass(pr.status),
                raisedBy: pr.raised_by_name,
                approvedBy: pr.approved_by,
                approvedAt: pr.approved_at,
                rejectionReason: pr.rejection_reason,
                convertedToPo: pr.converted_to_po,
                convertedToRfq: pr.converted_to_rfq,
                remarks: pr.remarks,
                createdAt: pr.created_at,
                age: calculateAge(pr.created_at),
                items: itemsQuery.rows.map(it => ({
                    id: it.id,
                    itemId: it.item_id,
                    itemName: it.item_name || 'Medical Consumable',
                    itemCode: it.item_code || '',
                    quantity: it.quantity,
                    uom: it.uom || 'units',
                    unitRate: parseFloat(it.estimated_unit_rate || '0'),
                    totalAmount: parseFloat(it.total_amount || '0'),
                    totalAmountFormatted: `₹${parseFloat(it.total_amount || '0').toLocaleString('en-IN')}`,
                    stockOnHand: it.total_on_hand,
                    category: it.category,
                })),
            }, 'Purchase request detail retrieved');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * POST /api/v1/purchase-requests
     * Create new PR with items inside database transaction
     */
    static async createPurchaseRequest(req, res, next) {
        await db.query('BEGIN');
        try {
            const validated = createPrSchema.parse(req.body);
            // 1. Generate unique PR number
            const seqQuery = await db.query(`SELECT pr_number FROM purchase_requests WHERE pr_number LIKE 'PR-24-%';`);
            let maxNumber = 4095;
            for (const row of seqQuery.rows) {
                const m = row.pr_number.match(/PR-24-(\d+)/);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (num > maxNumber)
                        maxNumber = num;
                }
            }
            const prNumber = `PR-24-${maxNumber + 1}`;
            const dept = validated.department || req.body.dept || 'Central Store';
            const remarks = validated.remarks || req.body.justification || '';
            let priority = validated.priority || 'Routine';
            if (/emergency/i.test(priority))
                priority = 'Emergency';
            else if (/urgent|high/i.test(priority))
                priority = 'Urgent';
            else
                priority = 'Routine';
            // 2. Resolve items with database lookup
            const enrichedItems = [];
            let totalEstValue = 0;
            for (const it of validated.items) {
                let itName = it.itemName;
                let itCode = it.itemCode || '';
                let itUom = it.uom || 'units';
                const qty = it.quantity || it.requestedQuantity || 1;
                let rate = it.unitRate;
                if (it.itemId) {
                    const itemDb = await db.query('SELECT name, item_code, uom, last_rate FROM items WHERE id = $1 LIMIT 1', [it.itemId]);
                    if (itemDb.rows.length > 0) {
                        itName = itName || itemDb.rows[0].name;
                        itCode = itCode || itemDb.rows[0].item_code || '';
                        itUom = itemDb.rows[0].uom || itUom;
                        if (!rate || rate <= 0) {
                            rate = Number(itemDb.rows[0].last_rate) || 100;
                        }
                    }
                }
                if (!itName)
                    itName = 'Hospital Formulary Item';
                if (!rate || rate <= 0) {
                    rate = it.estimatedCost ? Math.round(it.estimatedCost / qty) : 100;
                }
                const lineTotal = qty * rate;
                totalEstValue += lineTotal;
                enrichedItems.push({
                    itemId: it.itemId || null,
                    itemName: itName,
                    itemCode: itCode,
                    quantity: qty,
                    uom: itUom,
                    unitRate: rate,
                    total: lineTotal,
                });
            }
            // Default status: If > 2.5L, route to Pending CFO; else Pending L1
            const defaultStatus = totalEstValue >= 250000 ? 'Pending CFO' : 'Pending L1';
            // 3. Insert PR record
            const raisedBy = req.user?.name || 'Chief Procurement Officer';
            const insertPrResult = await db.query(`
        INSERT INTO purchase_requests (
          pr_number, source, department, purchase_type, priority, items_count, 
          estimated_value, status, raised_by_name, remarks, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
      `, [
                prNumber,
                validated.source,
                dept,
                validated.purchaseType,
                priority,
                enrichedItems.length,
                totalEstValue,
                defaultStatus,
                raisedBy,
                remarks,
            ]);
            const pr = insertPrResult.rows[0];
            // 4. Insert line items
            for (const it of enrichedItems) {
                await db.query(`
          INSERT INTO purchase_request_items (
            pr_id, item_id, item_name, item_code, quantity, uom, estimated_unit_rate, total_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
                    pr.id,
                    it.itemId,
                    it.itemName,
                    it.itemCode,
                    it.quantity,
                    it.uom,
                    it.unitRate,
                    it.total,
                ]);
            }
            // 5. Create audit notification
            await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read)
        VALUES ($1, $2, 'info', 'procurement', '/purchase-requests', false);
      `, [
                `New Purchase Request ${prNumber}`,
                `Requisition raised by ${validated.department} for ₹${totalEstValue.toLocaleString('en-IN')} (${validated.items.length} items).`,
            ]);
            await db.query('COMMIT');
            return ApiResponse.success(res, {
                id: pr.id,
                prNumber: pr.pr_number,
                department: pr.department,
                status: pr.status,
                estimatedValue: totalEstValue,
                itemsCount: validated.items.length,
            }, 'Purchase request created successfully', 201);
        }
        catch (err) {
            await db.query('ROLLBACK');
            if (err instanceof z.ZodError) {
                return next(new AppError(err.errors[0]?.message || 'Validation failed', 400));
            }
            next(err);
        }
    }
    /**
     * PATCH /api/v1/purchase-requests/:id/status
     * Advance approval status or reject PR
     */
    static async updatePrStatus(req, res, next) {
        try {
            const id = req.params.id;
            const validated = updatePrStatusSchema.parse(req.body);
            const isNumeric = /^\d+$/.test(id);
            const prQuery = isNumeric
                ? await db.query('SELECT * FROM purchase_requests WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM purchase_requests WHERE pr_number = $1 LIMIT 1;', [id]);
            if (prQuery.rows.length === 0) {
                throw new AppError('Purchase request not found', 404);
            }
            const existing = prQuery.rows[0];
            let approvedBy = validated.approvedBy;
            let approvedAt = null;
            let rejectionReason = validated.rejectionReason || null;
            if (validated.status === 'Approved') {
                approvedBy = approvedBy || 'Medical Director & CFO';
                approvedAt = new Date();
            }
            const updateResult = await db.query(`
        UPDATE purchase_requests
        SET 
          status = $1,
          approved_by = COALESCE($2, approved_by),
          approved_at = COALESCE($3, approved_at),
          rejection_reason = $4,
          remarks = COALESCE($5, remarks),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *;
      `, [
                validated.status,
                approvedBy || null,
                approvedAt,
                rejectionReason,
                validated.remarks || null,
                existing.id,
            ]);
            // Telemetry notification
            const notifType = validated.status === 'Approved' ? 'success' : validated.status === 'Rejected' ? 'critical' : 'info';
            await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read)
        VALUES ($1, $2, $3, 'procurement', '/purchase-requests', false);
      `, [
                `PR ${existing.pr_number} ${validated.status}`,
                `Purchase request status updated to ${validated.status} by ${approvedBy || 'Workflow Officer'}.`,
                notifType,
            ]);
            return ApiResponse.success(res, updateResult.rows[0], `Purchase request status updated to ${validated.status}`);
        }
        catch (err) {
            if (err instanceof z.ZodError) {
                return next(new AppError(err.errors[0]?.message || 'Validation failed', 400));
            }
            next(err);
        }
    }
    /**
     * POST /api/v1/purchase-requests/:id/convert
     * Convert an Approved PR to a Purchase Order or RFQ Tender
     */
    static async convertToPoOrRfq(req, res, next) {
        await db.query('BEGIN');
        try {
            const id = req.params.id;
            const { targetType } = req.body; // 'PO' | 'RFQ'
            const isNumeric = /^\d+$/.test(id);
            const prQuery = isNumeric
                ? await db.query('SELECT * FROM purchase_requests WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM purchase_requests WHERE pr_number = $1 LIMIT 1;', [id]);
            if (prQuery.rows.length === 0) {
                throw new AppError('Purchase request not found', 404);
            }
            const pr = prQuery.rows[0];
            if (pr.status !== 'Approved') {
                throw new AppError('Only Approved purchase requests can be converted to PO or RFQ.', 400);
            }
            if (targetType === 'PO') {
                // Auto-generate PO
                const lastPo = await db.query(`SELECT po_number FROM purchase_orders ORDER BY id DESC LIMIT 1;`);
                let poSeq = 1205;
                if (lastPo.rows.length > 0) {
                    const match = lastPo.rows[0].po_number.match(/PO-24-(\d+)/);
                    if (match)
                        poSeq = parseInt(match[1], 10) + 1;
                }
                const poNumber = `PO-24-${poSeq}`;
                // Get default vendor
                const vnd = await db.query(`SELECT id FROM vendors ORDER BY id ASC LIMIT 1;`);
                const vendorId = vnd.rows[0]?.id || 1;
                await db.query(`
          INSERT INTO purchase_orders (
            po_number, vendor_id, po_type, items_count, total_value, status, due_date
          ) VALUES ($1, $2, $3, $4, $5, 'Draft', 'In 7 days');
        `, [
                    poNumber,
                    vendorId,
                    pr.purchase_type || 'Regular PO',
                    pr.items_count,
                    pr.estimated_value,
                ]);
                await db.query(`
          UPDATE purchase_requests SET converted_to_po = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
        `, [poNumber, id]);
                await db.query('COMMIT');
                return ApiResponse.success(res, { poNumber, link: '/purchase-orders' }, `Converted to Purchase Order ${poNumber}`);
            }
            else {
                // Convert to RFQ
                const lastRfq = await db.query(`SELECT rfq_number FROM rfqs ORDER BY id DESC LIMIT 1;`);
                let rfqSeq = 320;
                if (lastRfq.rows.length > 0) {
                    const match = lastRfq.rows[0].rfq_number.match(/RFQ-24-(\d+)/);
                    if (match)
                        rfqSeq = parseInt(match[1], 10) + 1;
                }
                const rfqNumber = `RFQ-24-0${rfqSeq}`;
                await db.query(`
          INSERT INTO rfqs (rfq_number, title, pr_id, status, closing_date, remarks)
          VALUES ($1, $2, $3, 'Published', CURRENT_TIMESTAMP + INTERVAL '3 days', $4);
        `, [
                    rfqNumber,
                    `${pr.department} — ${pr.remarks || 'Consumables Requisition'}`,
                    pr.id,
                    `Generated from ${pr.pr_number}`,
                ]);
                await db.query(`
          UPDATE purchase_requests SET converted_to_rfq = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
        `, [rfqNumber, id]);
                await db.query('COMMIT');
                return ApiResponse.success(res, { rfqNumber, link: '/rfq-quotes' }, `Converted to RFQ Tender ${rfqNumber}`);
            }
        }
        catch (err) {
            await db.query('ROLLBACK');
            next(err);
        }
    }
    /**
     * PATCH /api/v1/purchase-requests/:id/approve-l1
     */
    static async approveL1(req, res, next) {
        req.body = { status: 'Pending CFO', approvedBy: req.user?.name || 'Department Head' };
        return PurchaseRequestsController.updatePrStatus(req, res, next);
    }
    /**
     * PATCH /api/v1/purchase-requests/:id/approve-cfo
     */
    static async approveCfo(req, res, next) {
        req.body = { status: 'Approved', approvedBy: req.user?.name || 'Chief Financial Officer' };
        return PurchaseRequestsController.updatePrStatus(req, res, next);
    }
    /**
     * POST /api/v1/purchase-requests/:id/convert-to-po
     */
    static async convertToPoDirect(req, res, next) {
        req.body = { ...req.body, targetType: 'PO' };
        return PurchaseRequestsController.convertToPoOrRfq(req, res, next);
    }
}
