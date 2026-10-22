import { ApiResponse } from '../utils/apiResponse.js';
export class AppError extends Error {
    statusCode;
    details;
    constructor(message, statusCode = 500, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
export function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    const message = err.message || 'Internal Server Error';
    console.error(`[API Error ${statusCode}]: ${req.method} ${req.url}`, {
        message,
        details: err.details,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    return ApiResponse.error(res, message, statusCode, err.details);
}
