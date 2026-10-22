import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from './error.middleware.js';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  name: string;
  exp?: number;
  token?: string;
  tokenHash?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token missing or invalid', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'hospital-crm-api',
      audience: 'hospital-crm-web',
    }) as AuthUser;

    // Cryptographic SHA-256 hash check against token blacklist
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const revoked = await db.query(
      'SELECT id FROM revoked_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash]
    );

    if (revoked.rows.length > 0) {
      return next(new AppError('Session has been terminated. Please sign in again.', 401));
    }

    req.user = {
      ...decoded,
      token,
      tokenHash,
    };
    next();
  } catch (error) {
    return next(new AppError('Invalid or expired authentication token', 401));
  }
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'hospital-crm-api',
      audience: 'hospital-crm-web',
    }) as AuthUser;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const revoked = await db.query(
      'SELECT id FROM revoked_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash]
    );

    if (revoked.rows.length === 0) {
      req.user = {
        ...decoded,
        token,
        tokenHash,
      };
    }
  } catch {
    // Non-fatal for optional authentication
  }
  next();
}

export function authorize(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized: User not authenticated', 401));
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient privileges for this operation', 403));
    }

    next();
  };
}
