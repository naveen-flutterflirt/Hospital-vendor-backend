import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../middleware/error.middleware.js';

// Strict enterprise login validation schema
const loginSchema = z.object({
  email: z
    .string({ required_error: 'Work email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid hospital email address format')
    .max(254, 'Email must be under 254 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must be under 128 characters'),
  branch: z.string().max(255).optional(),
});

// Constant-time dummy hash for timing attack mitigation against user enumeration
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM';

export class AuthController {
  /**
   * POST /api/v1/auth/login
   * Production-hardened login with rate limiting, Zod validation, and constant-time check
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((issue) => issue.message).join(', ');
        throw new AppError(errorMsg, 400);
      }

      const { email, password, branch } = parsed.data;

      const result = await db.query(
        `SELECT id, name, email, password_hash, role, department, branch, avatar_initials, badge 
         FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
        [email]
      );

      const user = result.rows[0];

      // Mitigate timing attack: run bcrypt check even if user doesn't exist
      if (!user) {
        await bcrypt.compare(password, DUMMY_HASH);
        throw new AppError('Invalid credentials. Please verify your work email and password.', 401);
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new AppError('Invalid credentials. Please verify your work email and password.', 401);
      }

      // Maintain audit trail
      await db.query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Generate Cryptographically Strong JWT
      const token = jwt.sign(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        env.JWT_SECRET,
        { 
          expiresIn: env.JWT_EXPIRES_IN as any,
          issuer: 'hospital-crm-api',
          audience: 'hospital-crm-web',
          algorithm: 'HS256',
        }
      );

      // Return clean user profile
      const { password_hash, ...profile } = user;
      if (branch) {
        profile.branch = branch;
      }

      return ApiResponse.success(
        res,
        {
          token,
          user: profile,
        },
        'Sign-in successful'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   * Token rehydration and verification
   */
  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401);
      }

      const result = await db.query(
        `SELECT id, name, email, role, department, branch, avatar_initials, badge 
         FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
        [req.user.id]
      );

      const user = result.rows[0];
      if (!user) {
        throw new AppError('User not found or deactivated', 404);
      }

      return ApiResponse.success(res, user, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Production logout:
   * 1. Blacklists JWT token by SHA-256 hash in PostgreSQL revoked_tokens table.
   * 2. Logs security audit trail in audit_logs table (HIPAA/NIST compliance).
   * 3. Terminates the user session immediately across all protected routes.
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.token) {
        throw new AppError('Not authenticated', 401);
      }

      const token = req.user.token;
      const tokenHash = req.user.tokenHash || crypto.createHash('sha256').update(token).digest('hex');

      // Calculate token expiration timestamp
      const expiresAt = req.user.exp
        ? new Date(req.user.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 1. Blacklist token in revoked_tokens table
      await db.query(
        `INSERT INTO revoked_tokens (token_hash, user_id, reason, expires_at)
         VALUES ($1, $2, 'USER_LOGOUT', $3)
         ON CONFLICT (token_hash) DO NOTHING`,
        [tokenHash, req.user.id, expiresAt]
      );

      // 2. Insert audit log for HIPAA / SOC-2 / enterprise compliance
      const rawIp = req.headers['x-forwarded-for'];
      const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
      const userAgent = (req.headers['user-agent'] as string) || 'unknown';

      await db.query(
        `INSERT INTO audit_logs (user_id, action, ip_address, user_agent, details)
         VALUES ($1, 'LOGOUT', $2, $3, $4)`,
        [
          req.user.id,
          clientIp,
          userAgent,
          JSON.stringify({
            email: req.user.email,
            role: req.user.role,
            timestamp: new Date().toISOString(),
          }),
        ]
      );

      return ApiResponse.success(
        res,
        null,
        'Session terminated successfully. Token has been revoked.'
      );
    } catch (error) {
      next(error);
    }
  }
}

