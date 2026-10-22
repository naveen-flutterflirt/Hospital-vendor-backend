import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';
function getIndentStatusClass(status, priority) {
    switch (status) {
        case 'Pending':
            return priority === 'Emergency' ? 'bg-[#D94432]/10 text-[#D94432]' : 'bg-[#E89A3C]/10 text-[#E89A3C]';
        case 'Processing':
            return 'bg-[#E89A3C]/10 text-[#E89A3C]';
        case 'Partially Issued':
            return 'bg-blue-100 text-blue-700';
        case 'Completed':
            return 'bg-[#1EB4A1]/20 text-[#127670]';
        case 'Cancelled':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}
function calculateAge(date) {
    if (!date)
        return 'Recently';
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1)
        return 'Just now';
    if (diffMins < 60)
        return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1)
        return '1 day ago';
    return `${diffDays} days ago`;
}
const indentItemSchema = z.object({
    itemId: z.number().optional().nullable(),
    itemName: z.string().optional().default(''),
    itemCode: z.string().optional().default(''),
    quantity: z.number().optional(),
    requestedQty: z.number().optional(),
    uom: z.string().optional().default('units'),
    currentStock: z.number().optional(),
});
const createIndentSchema = z.object({
    requestingDept: z.string().optional(),
    department: z.string().optional(),
    dept: z.string().optional(),
    toStoreName: z.string().optional(),
    toStore: z.string().optional(),
    priority: z.string().optional().default('Routine'),
    notes: z.string().optional().default(''),
    items: z.array(indentItemSchema).min(1, 'At least one item is required in the indent'),
});
const updateIndentStatusSchema = z.object({
    status: z.enum(['Pending', 'Processing', 'Partially Issued', 'Completed', 'Cancelled']),
    fulfilledBy: z.string().optional(),
    items: z.array(z.object({
        id: z.number(),
        quantityIssued: z.number().min(0),
        status: z.string().optional(),
    })).optional(),
});
export class IndentsController {
    /**
     * GET /api/v1/indents/kpis
     * Dynamic KPI metrics computed directly from PostgreSQL
     */
    static async getKpis(_req, res, next) {
        try {
            const kpisQuery = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'Pending') AS pending_count,
          COUNT(*) FILTER (WHERE priority IN ('Urgent', 'Emergency') AND status NOT IN ('Completed', 'Cancelled')) AS urgent_count,
          COUNT(*) FILTER (WHERE status IN ('Processing', 'Partially Issued')) AS processing_count,
          COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
        FROM indents;
      `);
            const stats = kpisQuery.rows[0];
            const kpis = [
                {
                    id: 'pending',
                    label: 'Pending Indents',
                    value: stats.pending_count || '0',
                    sub: 'Action required',
                    alert: parseInt(stats.pending_count, 10) > 10,
                },
                {
                    id: 'urgent',
                    label: 'Urgent / Emergency',
                    value: stats.urgent_count || '0',
                    sub: 'High priority',
                    alert: parseInt(stats.urgent_count, 10) > 0,
                },
                {
                    id: 'processing',
                    label: 'Processing',
                    value: stats.processing_count || '0',
                    sub: 'In stores',
                    alert: false,
                },
                {
                    id: 'completed',
                    label: 'Completed Today',
                    value: stats.completed_count || '0',
                    sub: 'Fully issued',
                    alert: false,
                },
            ];
            return ApiResponse.success(res, kpis, 'Indent KPIs fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/indents/lookups
     * Master data lookups for departments, stores, formulary items
     */
    static async getLookups(_req, res, next) {
        try {
            // 1. Distinct departments
            const deptsQuery = await db.query(`
        SELECT DISTINCT requesting_dept FROM indents ORDER BY requesting_dept ASC;
      `);
            const defaultDepts = ['ICU', 'Ward 3', 'OT 1', 'Emergency Dept', 'Pediatrics', 'Ward 1', 'Dialysis', 'Maternity', 'Cardiology', 'Orthopedics'];
            const dbDepts = deptsQuery.rows.map(r => r.requesting_dept).filter(Boolean);
            const allDepts = Array.from(new Set([...defaultDepts, ...dbDepts]));
            // 2. Distinct stores
            const storesQuery = await db.query(`
        SELECT DISTINCT to_store_name FROM indents ORDER BY to_store_name ASC;
      `);
            const defaultStores = ['IP Pharmacy', 'Central Store', 'General Store'];
            const dbStores = storesQuery.rows.map(r => r.to_store_name).filter(Boolean);
            const allStores = Array.from(new Set([...defaultStores, ...dbStores]));
            // 3. Formulary items from items table
            const itemsQuery = await db.query(`
        SELECT id, item_code, name, category, uom, total_on_hand, last_rate 
        FROM items 
        ORDER BY name ASC 
        LIMIT 100;
      `);
            const lookups = {
                departments: allDepts,
                stores: allStores,
                priorities: ['Routine', 'Urgent', 'Emergency'],
                statuses: ['Pending', 'Processing', 'Partially Issued', 'Completed', 'Cancelled'],
                items: itemsQuery.rows.map(it => ({
                    id: it.id,
                    itemCode: it.item_code,
                    name: it.name,
                    category: it.category,
                    uom: it.uom,
                    stockOnHand: it.total_on_hand,
                    lastRate: parseFloat(it.last_rate || '0'),
                })),
            };
            return ApiResponse.success(res, lookups, 'Lookups fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/indents
     * Paginated, searchable, filtered Indents list
     */
    static async getIndents(req, res, next) {
        try {
            const page = Math.max(1, parseInt(req.query.page || '1', 10));
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '8', 10)));
            const offset = (page - 1) * limit;
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const department = (req.query.department || '').trim();
            const store = (req.query.store || '').trim();
            const priority = (req.query.priority || '').trim();
            const sortBy = (req.query.sortBy || 'created_at').trim();
            const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            const conditions = [];
            const params = [];
            let paramIndex = 1;
            if (search) {
                conditions.push(`(
          ind.indent_number ILIKE $${paramIndex} OR 
          ind.requesting_dept ILIKE $${paramIndex} OR 
          ind.to_store_name ILIKE $${paramIndex} OR 
          ind.raised_by_name ILIKE $${paramIndex} OR 
          ind.notes ILIKE $${paramIndex}
        )`);
                params.push(`%${search}%`);
                paramIndex++;
            }
            if (status && status !== 'All') {
                conditions.push(`ind.status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }
            if (department && department !== 'All') {
                conditions.push(`ind.requesting_dept = $${paramIndex}`);
                params.push(department);
                paramIndex++;
            }
            if (store && store !== 'All') {
                conditions.push(`ind.to_store_name = $${paramIndex}`);
                params.push(store);
                paramIndex++;
            }
            if (priority && priority !== 'All') {
                conditions.push(`ind.priority = $${paramIndex}`);
                params.push(priority);
                paramIndex++;
            }
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            // Count query
            const countSql = `
        SELECT COUNT(*) AS total
        FROM indents ind
        ${whereClause};
      `;
            const countRes = await db.query(countSql, params);
            const total = parseInt(countRes.rows[0].total, 10);
            // Safe sorting mapping
            let orderColumn = 'ind.created_at';
            if (sortBy === 'indent_number')
                orderColumn = 'ind.indent_number';
            else if (sortBy === 'requesting_dept')
                orderColumn = 'ind.requesting_dept';
            else if (sortBy === 'priority')
                orderColumn = 'ind.priority';
            else if (sortBy === 'status')
                orderColumn = 'ind.status';
            else if (sortBy === 'items_count')
                orderColumn = 'items_count';
            // Data query with item count
            const dataSql = `
        SELECT 
          ind.id,
          ind.indent_number,
          ind.requesting_dept,
          ind.to_store_name,
          ind.priority,
          ind.status,
          ind.raised_by_name,
          ind.fulfilled_by,
          ind.fulfilled_at,
          ind.escalated_to_pr,
          ind.notes,
          ind.created_at,
          ind.updated_at,
          COALESCE(COUNT(ii.id), 0)::INTEGER AS items_count
        FROM indents ind
        LEFT JOIN indent_items ii ON ind.id = ii.indent_id
        ${whereClause}
        GROUP BY ind.id
        ORDER BY ${orderColumn} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
      `;
            const dataRes = await db.query(dataSql, [...params, limit, offset]);
            const indents = dataRes.rows.map(row => ({
                id: row.id,
                indentNumber: row.indent_number,
                dept: row.requesting_dept,
                toStore: row.to_store_name || 'IP Pharmacy',
                items: row.items_count,
                priority: row.priority,
                status: row.status,
                statusClass: getIndentStatusClass(row.status, row.priority),
                raisedBy: row.raised_by_name || 'Ward Nurse',
                fulfilledBy: row.fulfilled_by,
                fulfilledAt: row.fulfilled_at,
                escalatedToPr: row.escalated_to_pr,
                notes: row.notes,
                time: calculateAge(row.created_at),
                createdAt: row.created_at,
            }));
            const totalPages = Math.ceil(total / limit) || 1;
            return ApiResponse.success(res, {
                indents,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                },
            }, 'Indents fetched successfully');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/v1/indents/:id
     * Single indent details with full line items manifest
     */
    static async getIndentById(req, res, next) {
        try {
            const id = req.params.id;
            const isNumeric = /^\d+$/.test(id);
            const indentQuery = isNumeric
                ? await db.query('SELECT * FROM indents WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM indents WHERE indent_number = $1 LIMIT 1;', [id]);
            if (indentQuery.rows.length === 0) {
                throw new AppError('Indent not found', 404);
            }
            const indent = indentQuery.rows[0];
            // Fetch line items
            const itemsQuery = await db.query(`
        SELECT 
          ii.id,
          ii.indent_id,
          ii.item_id,
          ii.item_name,
          ii.item_code,
          ii.requested_qty AS quantity_requested,
          ii.issued_qty AS quantity_issued,
          ii.uom,
          ii.status,
          i.category,
          i.total_on_hand AS store_stock
        FROM indent_items ii
        LEFT JOIN items i ON ii.item_id = i.id
        WHERE ii.indent_id = $1
        ORDER BY ii.id ASC;
      `, [indent.id]);
            return ApiResponse.success(res, {
                id: indent.id,
                indentNumber: indent.indent_number,
                dept: indent.requesting_dept,
                toStore: indent.to_store_name || 'IP Pharmacy',
                priority: indent.priority,
                status: indent.status,
                statusClass: getIndentStatusClass(indent.status, indent.priority),
                raisedBy: indent.raised_by_name || 'Ward Nurse',
                fulfilledBy: indent.fulfilled_by,
                fulfilledAt: indent.fulfilled_at,
                escalatedToPr: indent.escalated_to_pr,
                notes: indent.notes,
                createdAt: indent.created_at,
                time: calculateAge(indent.created_at),
                items: itemsQuery.rows.map(it => ({
                    id: it.id,
                    itemId: it.item_id,
                    itemName: it.item_name || 'Medical Consumable',
                    itemCode: it.item_code || '',
                    quantityRequested: it.quantity_requested,
                    quantityIssued: it.quantity_issued || 0,
                    uom: it.uom || 'units',
                    status: it.status || 'Pending',
                    category: it.category || 'Consumables',
                    storeStock: it.store_stock ?? 0,
                })),
            }, 'Indent detail retrieved');
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * POST /api/v1/indents
     * Create new ward indent with line items inside transaction
     */
    static async createIndent(req, res, next) {
        try {
            const validated = createIndentSchema.parse(req.body);
            // 1. Generate unique indent number IND-24-XXXX
            const seqQuery = await db.query(`SELECT indent_number FROM indents WHERE indent_number LIKE 'IND-24-%';`);
            let maxNumber = 1198;
            for (const row of seqQuery.rows) {
                const m = row.indent_number?.match(/IND-24-(\d+)/);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (num > maxNumber)
                        maxNumber = num;
                }
            }
            const indentNumber = `IND-24-${maxNumber + 1}`;
            const raisedBy = req.user?.name || 'Staff Nurse';
            // 2. Begin transaction
            await db.query('BEGIN');
            const dept = validated.requestingDept || validated.department || validated.dept || 'General Ward';
            const toStore = validated.toStoreName || validated.toStore || 'Apex Pharmacy & Cold Chain Store';
            let priority = validated.priority || 'Routine';
            if (/emergency/i.test(priority))
                priority = 'Emergency';
            else if (/high|urgent/i.test(priority))
                priority = 'Urgent';
            else
                priority = 'Routine';
            const insertIndentResult = await db.query(`
        INSERT INTO indents (
          indent_number, requesting_dept, to_store_name, priority, status, 
          raised_by_name, notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'Pending', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
      `, [
                indentNumber,
                dept,
                toStore,
                priority,
                raisedBy,
                validated.notes || '',
            ]);
            const indent = insertIndentResult.rows[0];
            // 3. Insert line items
            for (const it of validated.items) {
                let itName = it.itemName;
                let itCode = it.itemCode || '';
                let itUom = it.uom || 'units';
                const qty = it.quantity || it.requestedQty || 1;
                if ((!itName || itName.trim() === '') && it.itemId) {
                    const itemDb = await db.query('SELECT name, item_code, uom FROM items WHERE id = $1 LIMIT 1', [it.itemId]);
                    if (itemDb.rows.length > 0) {
                        itName = itemDb.rows[0].name;
                        itCode = itCode || itemDb.rows[0].item_code || '';
                        itUom = itemDb.rows[0].uom || itUom;
                    }
                }
                if (!itName)
                    itName = 'Hospital Requisition Item';
                await db.query(`
          INSERT INTO indent_items (
            indent_id, item_id, item_name, item_code, requested_qty, issued_qty, uom, status
          ) VALUES ($1, $2, $3, $4, $5, 0, $6, 'Pending');
        `, [
                    indent.id,
                    it.itemId || null,
                    itName,
                    itCode,
                    qty,
                    itUom,
                ]);
            }
            // 4. Create audit notification
            await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read)
        VALUES ($1, $2, 'info', 'inventory', '/indents', false);
      `, [
                `New Indent ${indentNumber}`,
                `Requisition raised by ${dept} to ${toStore} (${validated.items.length} items, Priority: ${priority}).`,
            ]);
            await db.query('COMMIT');
            return ApiResponse.success(res, {
                id: indent.id,
                indentNumber: indent.indent_number,
                dept: indent.requesting_dept,
                toStore: indent.to_store_name,
                status: indent.status,
                itemsCount: validated.items.length,
            }, 'Indent created successfully', 201);
        }
        catch (err) {
            await db.query('ROLLBACK').catch(() => { });
            if (err instanceof z.ZodError) {
                return next(new AppError(err.errors[0]?.message || 'Validation failed', 400));
            }
            next(err);
        }
    }
    /**
     * PATCH /api/v1/indents/:id/status
     * Update indent status (Processing, Partially Issued, Completed, Cancelled)
     */
    static async updateIndentStatus(req, res, next) {
        try {
            const id = req.params.id;
            const validated = updateIndentStatusSchema.parse(req.body);
            const isNumeric = /^\d+$/.test(id);
            const indentQuery = isNumeric
                ? await db.query('SELECT * FROM indents WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM indents WHERE indent_number = $1 LIMIT 1;', [id]);
            if (indentQuery.rows.length === 0) {
                throw new AppError('Indent not found', 404);
            }
            const indent = indentQuery.rows[0];
            const fulfilledBy = validated.fulfilledBy || req.user?.name || 'Central Store Dispenser';
            await db.query('BEGIN');
            const isFulfilled = validated.status === 'Completed' || validated.status === 'Partially Issued';
            await db.query(`
        UPDATE indents 
        SET 
          status = $1,
          fulfilled_by = CASE WHEN $2 THEN $3 ELSE fulfilled_by END,
          fulfilled_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE fulfilled_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4;
      `, [
                validated.status,
                isFulfilled,
                fulfilledBy,
                indent.id,
            ]);
            // If line items quantities updated
            if (validated.items && validated.items.length > 0) {
                for (const it of validated.items) {
                    await db.query(`
            UPDATE indent_items
            SET 
              issued_qty = $1,
              status = $2
            WHERE id = $3 AND indent_id = $4;
          `, [
                        it.quantityIssued,
                        it.status || (it.quantityIssued > 0 ? 'Issued' : 'Pending'),
                        it.id,
                        indent.id,
                    ]);
                }
            }
            else if (validated.status === 'Completed') {
                // Auto-mark all line items as issued
                await db.query(`
          UPDATE indent_items
          SET 
            issued_qty = requested_qty,
            status = 'Issued'
          WHERE indent_id = $1;
        `, [indent.id]);
            }
            // Add notification
            await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read)
        VALUES ($1, $2, 'info', 'inventory', '/indents', false);
      `, [
                `Indent ${indent.indent_number} ${validated.status}`,
                `Indent for ${indent.requesting_dept} has been marked as ${validated.status} by ${fulfilledBy}.`,
            ]);
            await db.query('COMMIT');
            return ApiResponse.success(res, {
                id: indent.id,
                indentNumber: indent.indent_number,
                status: validated.status,
                fulfilledBy: isFulfilled ? fulfilledBy : indent.fulfilled_by,
            }, `Indent marked as ${validated.status}`);
        }
        catch (err) {
            await db.query('ROLLBACK').catch(() => { });
            if (err instanceof z.ZodError) {
                return next(new AppError(err.errors[0]?.message || 'Validation failed', 400));
            }
            next(err);
        }
    }
    /**
     * POST /api/v1/indents/:id/escalate
     * Escalate out-of-stock ward indent into an enterprise Purchase Request (PR)
     */
    static async escalateToPr(req, res, next) {
        try {
            const id = req.params.id;
            const isNumeric = /^\d+$/.test(id);
            const indentQuery = isNumeric
                ? await db.query('SELECT * FROM indents WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM indents WHERE indent_number = $1 LIMIT 1;', [id]);
            if (indentQuery.rows.length === 0) {
                throw new AppError('Indent not found', 404);
            }
            const indent = indentQuery.rows[0];
            if (indent.escalated_to_pr) {
                return ApiResponse.success(res, {
                    prNumber: indent.escalated_to_pr,
                    alreadyEscalated: true,
                }, `Indent is already escalated to Purchase Request ${indent.escalated_to_pr}`);
            }
            // Fetch indent items
            const itemsQuery = await db.query(`
        SELECT ii.*, i.last_rate 
        FROM indent_items ii
        LEFT JOIN items i ON ii.item_id = i.id
        WHERE ii.indent_id = $1;
      `, [indent.id]);
            if (itemsQuery.rows.length === 0) {
                throw new AppError('Cannot escalate indent with no items.', 400);
            }
            await db.query('BEGIN');
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
            // 2. Compute total estimated value
            let totalEstValue = 0;
            for (const it of itemsQuery.rows) {
                const rate = parseFloat(it.last_rate || '150');
                const qty = it.requested_qty || 1;
                totalEstValue += qty * rate;
            }
            // 3. Create purchase request
            const insertPrResult = await db.query(`
        INSERT INTO purchase_requests (
          pr_number, source, department, purchase_type, priority, items_count, 
          estimated_value, status, raised_by_name, remarks, created_at, updated_at
        ) VALUES (
          $1, 'Indent Escalation', $2, 'Emergency', $3, $4, $5, 'Pending L1', $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
      `, [
                prNumber,
                indent.requesting_dept,
                indent.priority === 'Emergency' ? 'Emergency' : 'Urgent',
                itemsQuery.rows.length,
                totalEstValue,
                indent.raised_by_name || 'Ward Requisition Desk',
                `Auto-escalated from Indent ${indent.indent_number}: ${indent.notes || 'Hospital stock exhausted'}`,
            ]);
            const pr = insertPrResult.rows[0];
            // 4. Copy line items into purchase_request_items
            for (const it of itemsQuery.rows) {
                const unitRate = parseFloat(it.last_rate || '150');
                const qty = it.requested_qty || 1;
                const total = qty * unitRate;
                await db.query(`
          INSERT INTO purchase_request_items (
            pr_id, item_id, item_name, item_code, quantity, uom, estimated_unit_rate, total_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
                    pr.id,
                    it.item_id || null,
                    it.item_name || 'Ward Item',
                    it.item_code || '',
                    qty,
                    it.uom || 'units',
                    unitRate,
                    total,
                ]);
            }
            // 5. Update indent record with escalated PR number
            await db.query(`
        UPDATE indents 
        SET escalated_to_pr = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [prNumber, indent.id]);
            // 6. Notification
            await db.query(`
        INSERT INTO notifications (title, message, type, category, link, is_read)
        VALUES ($1, $2, 'warning', 'procurement', '/purchase-requests', false);
      `, [
                `Indent Escalated: ${prNumber}`,
                `Indent ${indent.indent_number} from ${indent.requesting_dept} was escalated to Purchase Request ${prNumber}.`,
            ]);
            await db.query('COMMIT');
            return ApiResponse.success(res, {
                prId: pr.id,
                prNumber,
                indentNumber: indent.indent_number,
                estimatedValue: totalEstValue,
            }, `Indent escalated to Purchase Request ${prNumber} successfully`, 201);
        }
        catch (err) {
            await db.query('ROLLBACK').catch(() => { });
            next(err);
        }
    }
    /**
     * PATCH /api/v1/indents/:id/fulfill
     * One-click fulfillment of indent, issuing requested items
     */
    static async fulfillIndent(req, res, next) {
        try {
            const id = req.params.id;
            const isNumeric = /^\d+$/.test(id);
            const indentQuery = isNumeric
                ? await db.query('SELECT * FROM indents WHERE id = $1 LIMIT 1;', [parseInt(id, 10)])
                : await db.query('SELECT * FROM indents WHERE indent_number = $1 LIMIT 1;', [id]);
            if (indentQuery.rows.length === 0) {
                throw new AppError('Indent not found', 404);
            }
            const indent = indentQuery.rows[0];
            const fulfilledBy = req.user?.name || 'Chief Pharmacist';
            await db.query('BEGIN');
            await db.query(`
        UPDATE indents
        SET status = 'Completed', fulfilled_by = $1, fulfilled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [fulfilledBy, indent.id]);
            await db.query(`
        UPDATE indent_items
        SET issued_qty = requested_qty, status = 'Issued'
        WHERE indent_id = $1;
      `, [indent.id]);
            await db.query('COMMIT');
            return ApiResponse.success(res, {
                id: indent.id,
                indentNumber: indent.indent_number,
                status: 'Completed',
                fulfilledBy,
            }, 'Indent fulfilled and completed successfully');
        }
        catch (err) {
            await db.query('ROLLBACK').catch(() => { });
            next(err);
        }
    }
}
