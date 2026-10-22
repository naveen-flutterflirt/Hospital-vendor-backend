import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';
const createNotificationSchema = z.object({
    title: z.string().min(2, 'Title must be at least 2 characters'),
    message: z.string().min(3, 'Message must be at least 3 characters'),
    type: z.enum(['critical', 'warning', 'success', 'info']).default('info'),
    category: z.enum(['inventory', 'procurement', 'quality', 'telemetry', 'system']).default('system'),
    link: z.string().optional(),
    userId: z.number().optional().nullable(),
});
export class NotificationsController {
    /**
     * GET /api/v1/notifications
     * Retrieves live hospital alerts for the active user, ordered newest first
     */
    static async getNotifications(req, res, next) {
        try {
            const userId = req.user?.id || null;
            const listRes = await db.query(`SELECT 
          id, 
          user_id, 
          title, 
          message AS desc, 
          type, 
          category, 
          link, 
          is_read AS read, 
          read_at, 
          created_at,
          CASE 
            WHEN created_at >= NOW() - INTERVAL '1 minute' THEN 'Just now'
            WHEN created_at >= NOW() - INTERVAL '1 hour' THEN CONCAT(EXTRACT(MINUTE FROM NOW() - created_at)::INTEGER, 'm ago')
            WHEN created_at >= NOW() - INTERVAL '1 day' THEN CONCAT(EXTRACT(HOUR FROM NOW() - created_at)::INTEGER, 'h ago')
            WHEN created_at >= NOW() - INTERVAL '2 days' THEN 'Yesterday'
            ELSE TO_CHAR(created_at, 'Mon DD')
          END AS time
        FROM notifications
        WHERE ($1::INTEGER IS NULL OR user_id = $1::INTEGER OR user_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 30`, [userId]);
            const countRes = await db.query(`SELECT COUNT(*)::INTEGER AS unread_count 
         FROM notifications 
         WHERE ($1::INTEGER IS NULL OR user_id = $1::INTEGER OR user_id IS NULL) 
           AND is_read = FALSE`, [userId]);
            const unreadCount = Number(countRes.rows[0]?.unread_count || 0);
            return ApiResponse.success(res, {
                notifications: listRes.rows,
                unread_count: unreadCount,
            }, 'Notifications fetched successfully');
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /api/v1/notifications/unread-count
     * Lightweight poll endpoint for navbar badge
     */
    static async getUnreadCount(req, res, next) {
        try {
            const userId = req.user?.id || null;
            const countRes = await db.query(`SELECT COUNT(*)::INTEGER AS unread_count 
         FROM notifications 
         WHERE ($1::INTEGER IS NULL OR user_id = $1::INTEGER OR user_id IS NULL) 
           AND is_read = FALSE`, [userId]);
            return ApiResponse.success(res, { unread_count: Number(countRes.rows[0]?.unread_count || 0) }, 'Unread count retrieved');
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * PATCH /api/v1/notifications/:id/read
     * Marks an individual notification as read
     */
    static async markAsRead(req, res, next) {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (isNaN(id) || id <= 0) {
                throw new AppError('Valid notification ID required', 400);
            }
            const userId = req.user?.id || null;
            const updateRes = await db.query(`UPDATE notifications 
         SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND ($2::INTEGER IS NULL OR user_id = $2::INTEGER OR user_id IS NULL)
         RETURNING id, is_read, read_at`, [id, userId]);
            if (updateRes.rowCount === 0) {
                throw new AppError('Notification not found or access denied', 404);
            }
            // Compute remaining unread count
            const countRes = await db.query(`SELECT COUNT(*)::INTEGER AS unread_count 
         FROM notifications 
         WHERE ($1::INTEGER IS NULL OR user_id = $1::INTEGER OR user_id IS NULL) 
           AND is_read = FALSE`, [userId]);
            return ApiResponse.success(res, {
                notification: updateRes.rows[0],
                unread_count: Number(countRes.rows[0]?.unread_count || 0),
            }, 'Notification marked as read');
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * PATCH /api/v1/notifications/mark-all-read
     * Marks all unread alerts for this user as read
     */
    static async markAllRead(req, res, next) {
        try {
            const userId = req.user?.id || null;
            const updateRes = await db.query(`UPDATE notifications 
         SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
         WHERE ($1::INTEGER IS NULL OR user_id = $1::INTEGER OR user_id IS NULL) 
           AND is_read = FALSE
         RETURNING id`, [userId]);
            return ApiResponse.success(res, {
                updated_count: updateRes.rowCount || 0,
                unread_count: 0,
            }, 'All notifications marked as read');
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * POST /api/v1/notifications
     * Dispatches a new notification to a specific user or hospital broadcast
     */
    static async createNotification(req, res, next) {
        try {
            const parsed = createNotificationSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const { title, message, type, category, link, userId } = parsed.data;
            const insertRes = await db.query(`INSERT INTO notifications (user_id, title, message, type, category, link, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, CURRENT_TIMESTAMP)
         RETURNING id, user_id, title, message AS desc, type, category, link, is_read AS read, created_at`, [userId || null, title, message, type, category, link || null]);
            return ApiResponse.success(res, insertRes.rows[0], 'Notification dispatched successfully', 201);
        }
        catch (error) {
            next(error);
        }
    }
}
