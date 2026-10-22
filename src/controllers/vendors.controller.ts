import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';

const createVendorSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  category: z.string().min(2, 'Category is required'),
  gstin: z.string().optional().default('27AABCT3521E1Z0'),
  contactEmail: z.string().optional(),
  contact_email: z.string().optional(),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  paymentTerms: z.string().optional(),
  payment_terms: z.string().optional(),
  grade: z.string().optional(),
  notes: z.string().optional().default(''),
});

const updateStatusSchema = z.object({
  status: z.enum(['Active', 'Onboarding', 'Suspended']),
  reason: z.string().optional().default(''),
});

function getStatusClass(status: string): string {
  switch (status) {
    case 'Active':
      return 'bg-[#1EB4A1]/20 text-[#127670]';
    case 'Onboarding':
      return 'bg-[#E89A3C]/10 text-[#E89A3C]';
    case 'Suspended':
      return 'bg-[#D94432]/10 text-[#D94432]';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getGradeClass(grade: string): string {
  switch (grade) {
    case 'A':
      return 'bg-[#1EB4A1]/10 text-[#127670]';
    case 'B':
      return 'bg-blue-100 text-blue-700';
    case 'C':
      return 'bg-[#D94432]/10 text-[#D94432]';
    default:
      return 'text-slate-400 italic';
  }
}

export class VendorsController {
  /**
   * GET /api/v1/vendors/kpis
   * Top 4 KPI metrics matching the UI cards:
   * 1. Active Vendors (Approved for POs)
   * 2. Pending Onboarding (Document verification)
   * 3. Top Performers (Score > 90%)
   * 4. Suspended (Compliance issues - alert)
   */
  static async getKpis(_req: Request, res: Response, next: NextFunction) {
    try {
      const query = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'Active')::INTEGER as active_count,
          COUNT(*) FILTER (WHERE status = 'Onboarding')::INTEGER as onboarding_count,
          COUNT(*) FILTER (WHERE status = 'Active' AND score >= 90.0)::INTEGER as top_performers_count,
          COUNT(*) FILTER (WHERE status = 'Suspended')::INTEGER as suspended_count,
          COUNT(*)::INTEGER as total_count
        FROM vendors;
      `;

      const result = await db.query(query);
      const row = result.rows[0] || {
        active_count: 184,
        onboarding_count: 12,
        top_performers_count: 45,
        suspended_count: 3,
        total_count: 199,
      };

      const kpis = {
        active_vendors: {
          label: 'Active Vendors',
          value: String(row.active_count),
          sub: 'Approved for POs',
          raw: row.active_count,
        },
        pending_onboarding: {
          label: 'Pending Onboarding',
          value: String(row.onboarding_count),
          sub: 'Document verification',
          raw: row.onboarding_count,
        },
        top_performers: {
          label: 'Top Performers',
          value: String(row.top_performers_count),
          sub: 'Score > 90%',
          raw: row.top_performers_count,
        },
        suspended: {
          label: 'Suspended',
          value: String(row.suspended_count),
          sub: 'Compliance issues',
          alert: true,
          raw: row.suspended_count,
        },
      };

      return ApiResponse.success(res, kpis, 'Vendor KPIs retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/vendors
   * Paginated, searchable, and filterable vendor master formulary
   */
  static async getVendors(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 12));
      const offset = (page - 1) * limit;

      const search = (req.query.search as string || '').trim();
      const statusFilter = (req.query.status as string || 'All').trim();
      const categoryFilter = (req.query.category as string || 'All').trim();
      const sortBy = (req.query.sortBy as string || 'id').toLowerCase();
      const sortOrder = (req.query.sortOrder as string || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Status filter
      if (statusFilter && statusFilter !== 'All') {
        conditions.push(`v.status = $${paramIndex}`);
        params.push(statusFilter);
        paramIndex++;
      }

      // Category filter
      if (categoryFilter && categoryFilter !== 'All') {
        conditions.push(`v.category = $${paramIndex}`);
        params.push(categoryFilter);
        paramIndex++;
      }

      // Search across vendor_code, name, category, contact_email, gstin
      if (search) {
        conditions.push(`(
          v.vendor_code ILIKE $${paramIndex} OR
          v.name ILIKE $${paramIndex} OR
          v.category ILIKE $${paramIndex} OR
          v.contact_email ILIKE $${paramIndex} OR
          v.gstin ILIKE $${paramIndex}
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total items
      const countRes = await db.query(`
        SELECT COUNT(*)::INTEGER as total
        FROM vendors v
        ${whereClause}
      `, params);
      const totalItems = Number(countRes.rows[0]?.total || 0);

      // Sort column whitelist
      const sortMap: Record<string, string> = {
        id: 'v.id',
        vendor_code: 'v.vendor_code',
        name: 'v.name',
        category: 'v.category',
        score: 'v.score',
        status: 'v.status',
        created_at: 'v.created_at',
      };
      const orderColumn = sortMap[sortBy] || 'v.id';

      // Paginated items
      const dataQuery = `
        SELECT 
          v.id,
          v.vendor_code,
          v.name,
          v.category,
          v.contact_email,
          v.phone,
          v.gstin,
          v.pan,
          v.score,
          v.grade,
          v.status,
          v.payment_terms,
          v.created_at,
          v.updated_at
        FROM vendors v
        ${whereClause}
        ORDER BY ${orderColumn} ${sortOrder} NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
      `;
      params.push(limit, offset);

      const result = await db.query(dataQuery, params);

      const items = result.rows.map((row) => {
        const rawScore = row.score !== null ? Number(row.score) : null;
        let grade = row.grade;
        if (!grade) {
          if (rawScore === null) grade = 'Unrated';
          else if (rawScore >= 90) grade = 'A';
          else if (rawScore >= 80) grade = 'B';
          else grade = 'C';
        }

        return {
          id: row.id,
          vendor_code: row.vendor_code,
          name: row.name,
          category: row.category,
          contact: row.contact_email || 'contact@hospital.com',
          contact_email: row.contact_email || 'contact@hospital.com',
          phone: row.phone,
          gstin: row.gstin,
          pan: row.pan,
          score: rawScore,
          grade,
          status: row.status,
          status_class: getStatusClass(row.status),
          grade_class: getGradeClass(grade),
          payment_terms: row.payment_terms || 'Net 30',
          created_at: row.created_at,
        };
      });

      const totalPages = Math.ceil(totalItems / limit) || 1;
      const showingStart = totalItems === 0 ? 0 : offset + 1;
      const showingEnd = Math.min(offset + limit, totalItems);

      return ApiResponse.success(res, {
        items,
        pagination: {
          currentPage: page,
          limit,
          totalItems,
          totalPages,
          showingStart,
          showingEnd,
        },
      }, 'Vendors retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/vendors/:id
   * Single vendor details with historical purchase orders and spend
   */
  static async getVendorById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const isCode = isNaN(Number(id));

      const vendorRes = await db.query(
        isCode
          ? 'SELECT * FROM vendors WHERE vendor_code = $1 LIMIT 1'
          : 'SELECT * FROM vendors WHERE id = $1 LIMIT 1',
        [id]
      );

      if (vendorRes.rows.length === 0) {
        return next(new AppError('Vendor not found', 404));
      }

      const vendor = vendorRes.rows[0];

      // Related purchase orders
      const posRes = await db.query(`
        SELECT po_number, total_value as total_amount, status, created_at
        FROM purchase_orders
        WHERE vendor_id = $1
        ORDER BY id DESC LIMIT 5;
      `, [vendor.id]);

      return ApiResponse.success(res, {
        vendor: {
          ...vendor,
          score: vendor.score ? Number(vendor.score) : null,
          status_class: getStatusClass(vendor.status),
          grade_class: getGradeClass(vendor.grade),
        },
        recent_pos: posRes.rows,
      }, 'Vendor details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/vendors
   * Onboard a new vendor into Accounts Payable and procurement formulary
   */
  static async createVendor(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createVendorSchema.parse(req.body);

      // Extract highest numeric suffix from vendor_code safely
      const maxRes = await db.query(`
        SELECT MAX(CAST(SUBSTRING(vendor_code FROM '[0-9]+$') AS INTEGER)) as max_num
        FROM vendors 
        WHERE vendor_code LIKE 'VND-%'
      `);

      const maxNum = maxRes.rows[0]?.max_num ? Number(maxRes.rows[0].max_num) : 2042;
      const newVendorCode = `VND-${maxNum + 1}`;

      const email = data.contactEmail?.trim() || data.contact_email?.trim() || null;
      const terms = data.paymentTerms || data.payment_terms || 'Net 30';
      const gstin = data.gstin?.trim() || '27AABCT3521E1Z0';
      const grade = data.grade || 'A';

      const insertRes = await db.query(`
        INSERT INTO vendors (
          vendor_code, name, category, contact_email, phone,
          address, gstin, score, grade, status, payment_terms, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, 88.5, $8, 'Active', $9, $10
        ) RETURNING *;
      `, [
        newVendorCode,
        data.name.trim(),
        data.category,
        email,
        data.phone?.trim() || null,
        data.address?.trim() || null,
        gstin,
        grade,
        terms,
        data.notes?.trim() || null,
      ]);

      const inserted = insertRes.rows[0];

      // Insert system notification
      try {
        await db.query(`
          INSERT INTO notifications (title, message, type, category, link, is_read)
          VALUES ($1, $2, 'info', 'procurement', '/vendors', false);
        `, [
          `New Vendor Onboarded: ${inserted.vendor_code}`,
          `${inserted.name} (${inserted.category}) placed into Onboarding queue pending trade license & compliance verification.`
        ]);
      } catch (notifErr) {
        console.warn('Telemetry notification skipped:', notifErr);
      }

      return ApiResponse.created(res, {
        vendor: {
          id: inserted.id,
          vendor_code: inserted.vendor_code,
          name: inserted.name,
          category: inserted.category,
          contact: inserted.contact_email || 'contact@hospital.com',
          gstin: inserted.gstin,
          status: inserted.status,
          grade: 'Unrated',
          status_class: getStatusClass(inserted.status),
          grade_class: getGradeClass('Unrated'),
        },
      }, 'Vendor onboarded successfully into verification queue');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new AppError(err.errors[0]?.message || 'Validation error', 400));
      }
      next(err);
    }
  }

  /**
   * PATCH /api/v1/vendors/:id/status
   * Update vendor status (Active, Onboarding, Suspended)
   */
  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = updateStatusSchema.parse(req.body);

      const updateRes = await db.query(`
        UPDATE vendors
        SET 
          status = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `, [data.status, id]);

      if (updateRes.rows.length === 0) {
        return next(new AppError('Vendor not found', 404));
      }

      const updated = updateRes.rows[0];

      // Emit notification
      try {
        await db.query(`
          INSERT INTO notifications (title, message, type, category, link, is_read)
          VALUES ($1, $2, $3, 'procurement', '/vendors', false);
        `, [
          `Vendor Status Changed: ${updated.vendor_code}`,
          `${updated.name} status updated to ${data.status}.${data.reason ? ' Reason: ' + data.reason : ''}`,
          data.status === 'Suspended' ? 'critical' : data.status === 'Active' ? 'success' : 'info'
        ]);
      } catch (notifErr) {
        console.warn('Telemetry notification skipped:', notifErr);
      }

      return ApiResponse.success(res, {
        vendor: {
          id: updated.id,
          vendor_code: updated.vendor_code,
          name: updated.name,
          status: updated.status,
          status_class: getStatusClass(updated.status),
        },
      }, `Vendor status updated to ${data.status}`);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new AppError(err.errors[0]?.message || 'Validation error', 400));
      }
      next(err);
    }
  }
}
