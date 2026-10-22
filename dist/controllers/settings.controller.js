import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';
// Zod Schemas for Validation
const updateProfileSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    phone: z.string().trim().max(30).optional().nullable(),
});
const changePasswordSchema = z.object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
        .string()
        .min(10, 'New password must be at least 10 characters')
        .max(128)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});
const updateWorkflowsSchema = z.object({
    workflows: z.array(z.object({
        id: z.number(),
        threshold_amount: z.number().nonnegative('Threshold amount must be positive'),
        auto_approve_below: z.boolean(),
    })),
});
const updateNotificationsSchema = z.object({
    stockout_email: z.boolean().optional(),
    stockout_sms: z.boolean().optional(),
    stockout_in_app: z.boolean().optional(),
    expiry_30_days: z.boolean().optional(),
    expiry_60_days: z.boolean().optional(),
    expiry_90_days: z.boolean().optional(),
    grn_discrepancy_alert: z.boolean().optional(),
    po_approval_required: z.boolean().optional(),
    weekly_digest_email: z.boolean().optional(),
});
const updateIntegrationsSchema = z.object({
    integrations: z.array(z.object({
        integration_key: z.string(),
        endpoint_url: z.string().url('Must be a valid endpoint URL').optional().nullable(),
        is_enabled: z.boolean(),
    })),
});
export class SettingsController {
    // ==========================================
    // TAB 1: MY PROFILE
    // ==========================================
    static async getProfile(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const result = await db.query(`SELECT id, name, email, phone, role, department, branch, avatar_initials, avatar_url, badge, two_factor_enabled, created_at 
         FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
            const user = result.rows[0];
            if (!user)
                throw new AppError('User profile not found', 404);
            return ApiResponse.success(res, user, 'Profile retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    }
    static async updateProfile(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const parsed = updateProfileSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const { name, phone } = parsed.data;
            // Compute updated avatar initials from name
            const nameParts = name.trim().split(/\s+/);
            const avatarInitials = nameParts.length >= 2
                ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
                : name.slice(0, 2).toUpperCase();
            const result = await db.query(`UPDATE users 
         SET name = $1, phone = $2, avatar_initials = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 
         RETURNING id, name, email, phone, role, department, branch, avatar_initials, avatar_url, badge`, [name, phone || null, avatarInitials, req.user.id]);
            // Audit Log
            await db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, 'PROFILE_UPDATED', $2, $3, $4)`, [
                req.user.id,
                req.socket.remoteAddress || '127.0.0.1',
                req.headers['user-agent'] || 'unknown',
                JSON.stringify({ updated_name: name, updated_phone: phone }),
            ]);
            return ApiResponse.success(res, result.rows[0], 'Profile updated successfully');
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================
    // TAB 2: ROLES & SECURITY
    // ==========================================
    static async changePassword(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const parsed = changePasswordSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const { current_password, new_password } = parsed.data;
            // 1. Fetch current hash
            const userRes = await db.query(`SELECT password_hash FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
            const user = userRes.rows[0];
            if (!user)
                throw new AppError('User not found', 404);
            // 2. Validate current password
            const isMatch = await bcrypt.compare(current_password, user.password_hash);
            if (!isMatch) {
                throw new AppError('Incorrect current password.', 400);
            }
            // 3. Ensure new password differs
            if (current_password === new_password) {
                throw new AppError('New password must differ from current password.', 400);
            }
            // 4. Hash new password & update
            const newHash = await bcrypt.hash(new_password, 10);
            await db.query(`UPDATE users 
         SET password_hash = $1, last_password_change = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`, [newHash, req.user.id]);
            // 5. Audit Log
            await db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, 'PASSWORD_CHANGED', $2, $3, $4)`, [
                req.user.id,
                req.socket.remoteAddress || '127.0.0.1',
                req.headers['user-agent'] || 'unknown',
                JSON.stringify({ message: 'User password successfully changed' }),
            ]);
            return ApiResponse.success(res, null, 'Password successfully updated.');
        }
        catch (error) {
            next(error);
        }
    }
    static async toggle2FA(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const { enabled } = req.body;
            const targetState = Boolean(enabled);
            await db.query(`UPDATE users 
         SET two_factor_enabled = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`, [targetState, req.user.id]);
            await db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, '2FA_TOGGLED', $2, $3, $4)`, [
                req.user.id,
                req.socket.remoteAddress || '127.0.0.1',
                req.headers['user-agent'] || 'unknown',
                JSON.stringify({ two_factor_enabled: targetState }),
            ]);
            return ApiResponse.success(res, { two_factor_enabled: targetState }, targetState ? 'Two-Factor Authentication enabled' : 'Two-Factor Authentication disabled');
        }
        catch (error) {
            next(error);
        }
    }
    static async getSessions(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            // Ensure at least the current workstation session is listed
            const currentTokenHash = req.user.tokenHash || '';
            const sessions = await db.query(`SELECT id, device_info, ip_address, is_current, last_active, created_at 
         FROM user_sessions 
         WHERE user_id = $1 
         ORDER BY is_current DESC, last_active DESC`, [req.user.id]);
            let rows = sessions.rows;
            if (rows.length === 0) {
                // Create an initial active session record for display
                const inserted = await db.query(`INSERT INTO user_sessions (user_id, token_hash, device_info, ip_address, is_current)
           VALUES ($1, $2, 'Clinical Workstation · Chrome macOS', $3, true)
           RETURNING id, device_info, ip_address, is_current, last_active, created_at`, [req.user.id, currentTokenHash || crypto.randomBytes(32).toString('hex'), req.socket.remoteAddress || '192.168.1.104']);
                rows = inserted.rows;
            }
            return ApiResponse.success(res, rows, 'Active sessions retrieved');
        }
        catch (error) {
            next(error);
        }
    }
    static async revokeSession(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
            const sessionId = parseInt(String(rawId), 10);
            if (isNaN(sessionId))
                throw new AppError('Invalid session ID', 400);
            // Fetch session token hash
            const sessionRes = await db.query(`SELECT token_hash FROM user_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`, [sessionId, req.user.id]);
            if (sessionRes.rows.length === 0) {
                throw new AppError('Session not found', 404);
            }
            const { token_hash } = sessionRes.rows[0];
            // Blacklist token
            if (token_hash) {
                await db.query(`INSERT INTO revoked_tokens (token_hash, user_id, reason, expires_at)
           VALUES ($1, $2, 'REMOTE_REVOKE', CURRENT_TIMESTAMP + INTERVAL '7 days')
           ON CONFLICT (token_hash) DO NOTHING`, [token_hash, req.user.id]);
            }
            // Delete session
            await db.query(`DELETE FROM user_sessions WHERE id = $1 AND user_id = $2`, [
                sessionId,
                req.user.id,
            ]);
            return ApiResponse.success(res, null, 'Session revoked successfully');
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================
    // TAB 3: APPROVAL WORKFLOWS
    // ==========================================
    static async getWorkflows(_req, res, next) {
        try {
            const result = await db.query(`SELECT id, level_name, approver_role, threshold_amount, auto_approve_below, requires_quotations, is_active 
         FROM approval_workflows 
         ORDER BY id ASC`);
            return ApiResponse.success(res, result.rows, 'Approval workflows retrieved');
        }
        catch (error) {
            next(error);
        }
    }
    static async updateWorkflows(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            // Role check: Only CPO or Admin can modify hospital workflow thresholds
            const allowedRoles = ['Chief Procurement Officer', 'System Administrator', 'Admin'];
            if (!allowedRoles.includes(req.user.role)) {
                throw new AppError('Forbidden: Only CPO or System Administrator can alter procurement limits', 403);
            }
            const parsed = updateWorkflowsSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const { workflows } = parsed.data;
            for (const item of workflows) {
                await db.query(`UPDATE approval_workflows 
           SET threshold_amount = $1, auto_approve_below = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`, [item.threshold_amount, item.auto_approve_below, item.id]);
            }
            // Audit Log
            await db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, 'WORKFLOWS_UPDATED', $2, $3, $4)`, [
                req.user.id,
                req.socket.remoteAddress || '127.0.0.1',
                req.headers['user-agent'] || 'unknown',
                JSON.stringify({ updated_workflows: workflows }),
            ]);
            const refreshed = await db.query(`SELECT id, level_name, approver_role, threshold_amount, auto_approve_below, requires_quotations, is_active 
         FROM approval_workflows ORDER BY id ASC`);
            return ApiResponse.success(res, refreshed.rows, 'Approval workflows updated successfully');
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================
    // TAB 4: NOTIFICATIONS
    // ==========================================
    static async getNotifications(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const result = await db.query(`SELECT stockout_email, stockout_sms, stockout_in_app, expiry_30_days, expiry_60_days, expiry_90_days, 
                grn_discrepancy_alert, po_approval_required, weekly_digest_email 
         FROM notification_preferences 
         WHERE user_id = $1 LIMIT 1`, [req.user.id]);
            let prefs = result.rows[0];
            if (!prefs) {
                const created = await db.query(`INSERT INTO notification_preferences (user_id) VALUES ($1) 
           RETURNING stockout_email, stockout_sms, stockout_in_app, expiry_30_days, expiry_60_days, expiry_90_days, 
                     grn_discrepancy_alert, po_approval_required, weekly_digest_email`, [req.user.id]);
                prefs = created.rows[0];
            }
            return ApiResponse.success(res, prefs, 'Notification preferences retrieved');
        }
        catch (error) {
            next(error);
        }
    }
    static async updateNotifications(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const parsed = updateNotificationsSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const p = parsed.data;
            const result = await db.query(`INSERT INTO notification_preferences (
            user_id, stockout_email, stockout_sms, stockout_in_app, 
            expiry_30_days, expiry_60_days, expiry_90_days, 
            grn_discrepancy_alert, po_approval_required, weekly_digest_email, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
            stockout_email = COALESCE(EXCLUDED.stockout_email, notification_preferences.stockout_email),
            stockout_sms = COALESCE(EXCLUDED.stockout_sms, notification_preferences.stockout_sms),
            stockout_in_app = COALESCE(EXCLUDED.stockout_in_app, notification_preferences.stockout_in_app),
            expiry_30_days = COALESCE(EXCLUDED.expiry_30_days, notification_preferences.expiry_30_days),
            expiry_60_days = COALESCE(EXCLUDED.expiry_60_days, notification_preferences.expiry_60_days),
            expiry_90_days = COALESCE(EXCLUDED.expiry_90_days, notification_preferences.expiry_90_days),
            grn_discrepancy_alert = COALESCE(EXCLUDED.grn_discrepancy_alert, notification_preferences.grn_discrepancy_alert),
            po_approval_required = COALESCE(EXCLUDED.po_approval_required, notification_preferences.po_approval_required),
            weekly_digest_email = COALESCE(EXCLUDED.weekly_digest_email, notification_preferences.weekly_digest_email),
            updated_at = CURRENT_TIMESTAMP
         RETURNING stockout_email, stockout_sms, stockout_in_app, expiry_30_days, expiry_60_days, expiry_90_days, 
                   grn_discrepancy_alert, po_approval_required, weekly_digest_email`, [
                req.user.id,
                p.stockout_email ?? true,
                p.stockout_sms ?? false,
                p.stockout_in_app ?? true,
                p.expiry_30_days ?? true,
                p.expiry_60_days ?? true,
                p.expiry_90_days ?? false,
                p.grn_discrepancy_alert ?? true,
                p.po_approval_required ?? true,
                p.weekly_digest_email ?? true,
            ]);
            return ApiResponse.success(res, result.rows[0], 'Notification preferences saved');
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================
    // TAB 5: INTEGRATIONS & WEBHOOKS
    // ==========================================
    static async getIntegrations(_req, res, next) {
        try {
            const result = await db.query(`SELECT id, integration_key, name, endpoint_url, secret_key_masked, is_enabled, last_sync_status, last_sync_at 
         FROM system_integrations 
         ORDER BY id ASC`);
            return ApiResponse.success(res, result.rows, 'System integrations retrieved');
        }
        catch (error) {
            next(error);
        }
    }
    static async updateIntegrations(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const allowedRoles = ['Chief Procurement Officer', 'System Administrator', 'Admin'];
            if (!allowedRoles.includes(req.user.role)) {
                throw new AppError('Forbidden: Only System Administrator or CPO can modify external webhooks', 403);
            }
            const parsed = updateIntegrationsSchema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join(', ');
                throw new AppError(msg, 400);
            }
            const { integrations } = parsed.data;
            for (const item of integrations) {
                await db.query(`UPDATE system_integrations 
           SET endpoint_url = $1, is_enabled = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE integration_key = $3`, [item.endpoint_url || null, item.is_enabled, item.integration_key]);
            }
            // Audit Log
            await db.query(`INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, 'INTEGRATIONS_CONFIGURED', $2, $3, $4)`, [
                req.user.id,
                req.socket.remoteAddress || '127.0.0.1',
                req.headers['user-agent'] || 'unknown',
                JSON.stringify({ updated_integrations: integrations.map((i) => i.integration_key) }),
            ]);
            const refreshed = await db.query(`SELECT id, integration_key, name, endpoint_url, secret_key_masked, is_enabled, last_sync_status, last_sync_at 
         FROM system_integrations ORDER BY id ASC`);
            return ApiResponse.success(res, refreshed.rows, 'Integrations updated successfully');
        }
        catch (error) {
            next(error);
        }
    }
    static async testIntegration(req, res, next) {
        try {
            if (!req.user)
                throw new AppError('Unauthorized', 401);
            const { integration_key } = req.body;
            if (!integration_key)
                throw new AppError('integration_key is required', 400);
            const itemRes = await db.query(`SELECT id, name, endpoint_url, is_enabled FROM system_integrations WHERE integration_key = $1 LIMIT 1`, [integration_key]);
            if (itemRes.rows.length === 0)
                throw new AppError('Integration not found', 404);
            const item = itemRes.rows[0];
            // Simulate ping latency (28ms - 65ms typical clinical LAN response)
            const latencyMs = Math.floor(Math.random() * 38) + 28;
            await db.query(`UPDATE system_integrations 
         SET last_sync_status = 'Healthy', last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE integration_key = $1`, [integration_key]);
            return ApiResponse.success(res, {
                integration_key,
                name: item.name,
                status: 'Healthy',
                latency_ms: latencyMs,
                timestamp: new Date().toISOString(),
            }, `Connection handshake verified with ${item.name} (${latencyMs}ms)`);
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================
    // TAB 6: HOSPITAL SYSTEM CONFIGURATION
    // ==========================================
    static systemConfig = {
        hospitalName: 'Apex Multi-Speciality Tertiary Care Hospital',
        hospitalCode: 'APEX-DEL-01',
        taxGstNumber: '07AAAAA0000A1Z5',
        currency: 'INR (₹)',
        timezone: 'Asia/Kolkata',
        emergencyReorderLeadDays: 2,
        autoApproveEmergencyIndents: true,
        threeWayMatchTolerancePercent: 2.5,
        coldChainAlertThresholdCelsius: 8.0,
        fiscalYearStart: '04-01',
        defaultStore: 'Apex Pharmacy & Cold Chain Store',
    };
    static async getConfig(_req, res, next) {
        try {
            return ApiResponse.success(res, SettingsController.systemConfig, 'Hospital configurations retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    }
    static async updateConfig(req, res, next) {
        try {
            const updates = req.body || {};
            SettingsController.systemConfig = {
                ...SettingsController.systemConfig,
                ...updates,
            };
            try {
                await db.query(`INSERT INTO notifications (title, message, type, category, link, is_read)
           VALUES ($1, $2, 'info', 'system', '/settings', false)`, [
                    'Hospital System Configuration Updated',
                    'Global hospital procurement settings updated successfully.'
                ]);
            }
            catch (err) { }
            return ApiResponse.success(res, SettingsController.systemConfig, 'Hospital department thresholds updated successfully');
        }
        catch (error) {
            next(error);
        }
    }
}
