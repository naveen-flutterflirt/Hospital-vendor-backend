import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';

const negotiateSchema = z.object({
  vendorId: z.number({ required_error: 'Vendor is required' }),
  message: z.string().optional().default(''),
  targetRates: z.array(z.object({
    rfqItemId: z.number(),
    targetRate: z.number().min(0, 'Target rate must be non-negative'),
  })).optional().default([]),
});

const awardSchema = z.object({
  vendorId: z.number({ required_error: 'Awarded vendor is required' }),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

export class RfqQuotesController {
  /**
   * GET /api/v1/rfq-quotes
   * Retrieve list of all RFQs for navigation and switcher
   */
  static async getRfqs(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await db.query(`
        SELECT 
          r.id,
          r.rfq_number,
          r.title,
          r.category,
          r.department,
          r.status,
          r.invited_count,
          r.responded_count,
          r.closes_at_label,
          r.closing_date,
          r.benchmark_total,
          r.savings_amount,
          r.savings_percent,
          r.awarded_vendor_id,
          r.awarded_po_id,
          r.created_at
        FROM rfqs r
        ORDER BY r.id ASC;
      `);

      return ApiResponse.success(res, result.rows, 'RFQs retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/rfq-quotes/:id
   * Complete multi-vendor side-by-side comparison matrix for an RFQ
   */
  static async getRfqComparison(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      // 1. Fetch RFQ header
      let rfqRes;
      if (/^\d+$/.test(idParam)) {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE id = $1', [parseInt(idParam, 10)]);
      } else {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE rfq_number = $1', [idParam]);
      }

      if (rfqRes.rows.length === 0) {
        throw new AppError('RFQ not found', 404);
      }

      const rfq = rfqRes.rows[0];

      // 2. Fetch Vendors who submitted quotes for this RFQ
      const quotesRes = await db.query(`
        SELECT 
          q.id as quote_id,
          q.vendor_id,
          q.vendor_name,
          v.vendor_code,
          q.quote_ref,
          q.credit_terms,
          q.delivery_lead,
          q.total_quoted_amount,
          q.is_partial,
          q.vendor_score,
          q.is_new_vendor,
          q.is_awarded,
          q.status,
          q.negotiation_notes
        FROM rfq_quotes q
        JOIN vendors v ON q.vendor_id = v.id
        WHERE q.rfq_id = $1
        ORDER BY q.id ASC;
      `, [rfq.id]);

      const vendors = quotesRes.rows;

      // 3. Fetch Items in this RFQ
      const itemsRes = await db.query(`
        SELECT 
          i.id,
          i.item_code,
          i.item_name,
          i.uom,
          i.quantity,
          i.last_price,
          i.target_price,
          i.recommended_vendor_id,
          i.recommended_vendor_name,
          i.is_new_vendor,
          i.notes
        FROM rfq_items i
        WHERE i.rfq_id = $1
        ORDER BY i.id ASC;
      `, [rfq.id]);

      // 4. Fetch all Quote line item rates for this RFQ
      const quoteItemsRes = await db.query(`
        SELECT 
          qi.id,
          qi.quote_id,
          q.vendor_id,
          qi.rfq_item_id,
          qi.unit_price,
          qi.total_price,
          qi.is_l1,
          qi.is_no_bid,
          qi.notes
        FROM rfq_quote_items qi
        JOIN rfq_quotes q ON qi.quote_id = q.id
        WHERE q.rfq_id = $1;
      `, [rfq.id]);

      // Index quote items by item_id and vendor_id
      const quoteMap: Record<number, Record<number, any>> = {};
      quoteItemsRes.rows.forEach((qi: any) => {
        if (!quoteMap[qi.rfq_item_id]) {
          quoteMap[qi.rfq_item_id] = {};
        }
        quoteMap[qi.rfq_item_id][qi.vendor_id] = {
          quoteItemId: qi.id,
          quoteId: qi.quote_id,
          unitPrice: qi.unit_price ? Number(qi.unit_price) : null,
          totalPrice: qi.total_price ? Number(qi.total_price) : null,
          isL1: qi.is_l1,
          isNoBid: qi.is_no_bid,
          displayPrice: qi.is_no_bid ? 'No bid' : `₹${Number(qi.unit_price).toFixed(1)}`,
        };
      });

      // Construct item rows
      const items = itemsRes.rows.map((it: any) => {
        const vendorQuotes = quoteMap[it.id] || {};

        return {
          id: it.id,
          itemCode: it.item_code,
          itemName: it.item_name,
          uom: it.uom,
          quantity: it.quantity,
          lastPrice: Number(it.last_price),
          lastPriceFormatted: `₹${Number(it.last_price).toFixed(1)}`,
          targetPrice: it.target_price ? Number(it.target_price) : null,
          recommendedVendorId: it.recommended_vendor_id,
          recommendedVendorName: it.recommended_vendor_name,
          isNewVendor: it.is_new_vendor,
          quotes: vendorQuotes,
        };
      });

      // 5. Vendor Totals & Summary computation
      const benchmarkTotal = Number(rfq.benchmark_total || 0);
      const benchmarkFormatted = benchmarkTotal >= 100000 
        ? `₹${(benchmarkTotal / 100000).toFixed(2)}L` 
        : `₹${benchmarkTotal.toLocaleString('en-IN')}`;

      const vendorTotals: Record<number, any> = {};
      vendors.forEach((v: any) => {
        const val = Number(v.total_quoted_amount || 0);
        const lakhs = (val / 100000).toFixed(2);
        vendorTotals[v.vendor_id] = {
          vendorId: v.vendor_id,
          vendorName: v.vendor_name,
          totalAmount: val,
          displayTotal: v.is_partial ? 'Partial' : (val >= 100000 ? `₹${lakhs}L` : `₹${val.toLocaleString('en-IN')}`),
          isPartial: v.is_partial,
          creditTerms: v.credit_terms,
          deliveryLead: v.delivery_lead,
          score: v.vendor_score,
          isNewVendor: v.is_new_vendor,
          status: v.status,
        };
      });

      const savingsAmount = Number(rfq.savings_amount || 0);
      const savingsPercent = Number(rfq.savings_percent || 0);
      const savingsFormatted = savingsAmount >= 1000
        ? `Save ₹${(savingsAmount / 1000).toFixed(1)}K (${savingsPercent}%)`
        : `Save ₹${savingsAmount} (${savingsPercent}%)`;

      return ApiResponse.success(res, {
        rfq: {
          id: rfq.id,
          rfqNumber: rfq.rfq_number,
          title: rfq.title,
          category: rfq.category,
          department: rfq.department,
          status: rfq.status,
          invitedCount: rfq.invited_count,
          respondedCount: rfq.responded_count,
          closesAtLabel: rfq.closes_at_label,
          closingDate: rfq.closing_date,
          benchmarkTotal,
          benchmarkFormatted,
          savingsAmount,
          savingsPercent,
          savingsFormatted,
          awardedVendorId: rfq.awarded_vendor_id,
          awardedPoId: rfq.awarded_po_id,
          awardedAt: rfq.awarded_at,
          remarks: rfq.remarks,
        },
        vendors: vendors.map((v: any) => ({
          quoteId: v.quote_id,
          vendorId: v.vendor_id,
          vendorName: v.vendor_name,
          vendorCode: v.vendor_code,
          quoteRef: v.quote_ref,
          creditTerms: v.credit_terms,
          deliveryLead: v.delivery_lead,
          totalQuotedAmount: Number(v.total_quoted_amount),
          isPartial: v.is_partial,
          vendorScore: v.vendor_score,
          isNewVendor: v.is_new_vendor,
          isAwarded: v.is_awarded,
          status: v.status,
        })),
        items,
        totals: {
          benchmarkTotal,
          benchmarkFormatted,
          vendorTotals,
          savingsFormatted,
        },
      }, 'RFQ comparison retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/rfq-quotes/:id/negotiate
   * Propose counter target prices to a quoting vendor
   */
  static async negotiateQuote(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = negotiateSchema.parse(req.body);

      // Verify RFQ
      let rfqRes;
      if (/^\d+$/.test(idParam)) {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE id = $1', [parseInt(idParam, 10)]);
      } else {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE rfq_number = $1', [idParam]);
      }

      if (rfqRes.rows.length === 0) {
        throw new AppError('RFQ not found', 404);
      }

      const rfq = rfqRes.rows[0];

      // Verify Quote for this vendor
      const quoteRes = await db.query(
        'SELECT * FROM rfq_quotes WHERE rfq_id = $1 AND vendor_id = $2',
        [rfq.id, parsed.vendorId]
      );

      if (quoteRes.rows.length === 0) {
        throw new AppError('Quote for this vendor not found in this RFQ', 404);
      }

      const quote = quoteRes.rows[0];

      // Update target rates on items if provided
      for (const target of parsed.targetRates) {
        await db.query(`
          UPDATE rfq_items 
          SET target_price = $1 
          WHERE id = $2 AND rfq_id = $3;
        `, [target.targetRate, target.rfqItemId, rfq.id]);
      }

      // Update quote status to 'Negotiating'
      await db.query(`
        UPDATE rfq_quotes 
        SET status = 'Negotiating',
            negotiation_notes = $1
        WHERE id = $2;
      `, [parsed.message, quote.id]);

      // Record audit notification
      try {
        await db.query(`
          INSERT INTO notifications (title, message, type, category, link, is_read)
          VALUES ($1, $2, 'info', 'procurement', '/rfq-quotes', false);
        `, [
          `Negotiation Dispatched: ${rfq.rfq_number}`,
          `Counter target pricing request sent to ${quote.vendor_name} for ${rfq.title}.`,
        ]);
      } catch (notifErr) {
        console.warn('Failed to insert notification:', notifErr);
      }

      return ApiResponse.success(res, {
        rfqNumber: rfq.rfq_number,
        vendorId: parsed.vendorId,
        vendorName: quote.vendor_name,
        status: 'Negotiating',
      }, `Negotiation request sent to ${quote.vendor_name}`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/rfq-quotes/:id/award
   * Award RFQ, create Purchase Order in DB, and log audit event
   */
  static async awardAndCreatePo(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = awardSchema.parse(req.body);

      // Verify RFQ
      let rfqRes;
      if (/^\d+$/.test(idParam)) {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE id = $1', [parseInt(idParam, 10)]);
      } else {
        rfqRes = await db.query('SELECT * FROM rfqs WHERE rfq_number = $1', [idParam]);
      }

      if (rfqRes.rows.length === 0) {
        throw new AppError('RFQ not found', 404);
      }

      const rfq = rfqRes.rows[0];

      // Fetch quote for awarded vendor
      let quoteRes = await db.query(`
        SELECT q.*, v.name as vendor_name, v.vendor_code, v.payment_terms as vendor_terms
        FROM rfq_quotes q
        JOIN vendors v ON q.vendor_id = v.id
        WHERE q.rfq_id = $1 AND q.vendor_id = $2;
      `, [rfq.id, parsed.vendorId]);

      if (quoteRes.rows.length === 0) {
        // Fallback: Pick the lowest quoting vendor for this RFQ
        quoteRes = await db.query(`
          SELECT q.*, v.name as vendor_name, v.vendor_code, v.payment_terms as vendor_terms
          FROM rfq_quotes q
          JOIN vendors v ON q.vendor_id = v.id
          WHERE q.rfq_id = $1
          ORDER BY q.total_quoted_amount ASC
          LIMIT 1;
        `, [rfq.id]);
      }

      if (quoteRes.rows.length === 0) {
        throw new AppError('No quotes available to award for this RFQ', 404);
      }

      const quote = quoteRes.rows[0];

      // Fetch line items quoted by this vendor
      const itemsRes = await db.query(`
        SELECT 
          qi.id,
          qi.unit_price,
          qi.tax_percent,
          qi.total_price,
          qi.is_no_bid,
          ri.item_id,
          ri.item_code,
          ri.item_name,
          ri.quantity,
          ri.uom
        FROM rfq_quote_items qi
        JOIN rfq_items ri ON qi.rfq_item_id = ri.id
        WHERE qi.quote_id = $1 AND (qi.is_no_bid IS FALSE OR qi.is_no_bid IS NULL);
      `, [quote.id]);

      const validLines = itemsRes.rows;
      if (validLines.length === 0) {
        throw new AppError('Awarded vendor has no bid items to generate a Purchase Order', 400);
      }

      // Generate next PO Number
      const lastPoRes = await db.query(`
        SELECT po_number 
        FROM purchase_orders 
        WHERE po_number LIKE 'PO-24-%'
        ORDER BY id DESC 
        LIMIT 1;
      `);

      let nextPoNum = 'PO-24-1265';
      if (lastPoRes.rows.length > 0) {
        const match = lastPoRes.rows[0].po_number.match(/PO-24-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10) + 1;
          nextPoNum = `PO-24-${num}`;
        }
      }

      const poTotal = validLines.reduce((sum: number, it: any) => sum + Number(it.total_price || 0), 0);
      const paymentTerms = parsed.paymentTerms || quote.credit_terms || quote.vendor_terms || 'Net 30';

      // Insert Purchase Order
      const createPoRes = await db.query(`
        INSERT INTO purchase_orders (
          po_number, vendor_id, rfq_id, po_type, items_count,
          total_value, status, due_date, payment_terms, notes,
          shipping_address, billing_address
        ) VALUES (
          $1, $2, $3, 'Rate-contract PO', $4,
          $5, 'Awaiting approval', $6, $7, $8,
          $9, $10
        ) RETURNING id, po_number;
      `, [
        nextPoNum,
        quote.vendor_id,
        rfq.id,
        validLines.length,
        poTotal,
        quote.delivery_lead || 'In 7 days',
        paymentTerms,
        parsed.notes || `Awarded tender contract from ${rfq.rfq_number} (${rfq.title}).`,
        'Central Receiving Dock, Apex Super Specialty Hospital, Main Campus',
        'Accounts Dept, Apex Super Specialty Hospital, Main Campus',
      ]);

      const createdPo = createPoRes.rows[0];

      // Insert line items
      for (const line of validLines) {
        await db.query(`
          INSERT INTO purchase_order_items (
            po_id, item_id, item_code, item_name, quantity,
            unit_price, tax_percent, line_total, uom
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `, [
          createdPo.id,
          line.item_id || null,
          line.item_code,
          line.item_name,
          line.quantity,
          Number(line.unit_price),
          Number(line.tax_percent || 12.0),
          Number(line.total_price),
          line.uom || 'units',
        ]);
      }

      // Update RFQ status to 'Awarded'
      await db.query(`
        UPDATE rfqs 
        SET status = 'Awarded',
            awarded_vendor_id = $1,
            awarded_po_id = $2,
            awarded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `, [quote.vendor_id, createdPo.id, rfq.id]);

      // Mark quote as awarded
      await db.query(`
        UPDATE rfq_quotes 
        SET is_awarded = true,
            status = 'Awarded'
        WHERE id = $1;
      `, [quote.id]);

      // Record audit notification
      try {
        await db.query(`
          INSERT INTO notifications (title, message, type, category, link, is_read)
          VALUES ($1, $2, 'success', 'procurement', '/purchase-orders', false);
        `, [
          `Tender Awarded: ${rfq.rfq_number}`,
          `Contract awarded to ${quote.vendor_name}. Purchase Order ${nextPoNum} generated for ₹${poTotal.toLocaleString('en-IN')}.`,
        ]);
      } catch (notifErr) {
        console.warn('Failed to insert notification:', notifErr);
      }

      return ApiResponse.created(res, {
        rfqNumber: rfq.rfq_number,
        poNumber: createdPo.po_number,
        poId: createdPo.id,
        awardedVendor: quote.vendor_name,
        totalAmount: poTotal,
        message: `Contract awarded to ${quote.vendor_name}. Generated ${createdPo.po_number}!`,
      }, 'Contract awarded and Purchase Order generated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/rfq-quotes/config
   * Dynamic approval matrix and supported purchase types from database
   */
  static async getConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const [matrixRes, typesRes] = await Promise.all([
        db.query(`
          SELECT id, po_value_tier, level_1, level_2, level_3, remarks 
          FROM approval_matrices 
          ORDER BY display_order ASC;
        `),
        db.query(`
          SELECT id, name, description 
          FROM purchase_types 
          ORDER BY display_order ASC;
        `),
      ]);

      return ApiResponse.success(res, {
        approvalMatrix: matrixRes.rows,
        purchaseTypes: typesRes.rows,
      }, 'Configuration fetched successfully');
    } catch (err) {
      next(err);
    }
  }
}
