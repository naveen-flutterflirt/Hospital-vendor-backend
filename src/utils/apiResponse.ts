import { Response } from 'express';

export class ApiResponse {
  static success<T>(
    res: Response, 
    data: T, 
    message = 'Success', 
    statusCode = 200, 
    meta?: Record<string, any>
  ) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta && { meta })
    });
  }

  static created<T>(res: Response, data: T, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

  static error(
    res: Response, 
    message = 'An error occurred', 
    statusCode = 500, 
    errors?: any
  ) {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(errors && { errors })
    });
  }
}
