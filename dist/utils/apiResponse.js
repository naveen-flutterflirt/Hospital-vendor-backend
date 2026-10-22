export class ApiResponse {
    static success(res, data, message = 'Success', statusCode = 200, meta) {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            ...(meta && { meta })
        });
    }
    static created(res, data, message = 'Resource created successfully') {
        return ApiResponse.success(res, data, message, 201);
    }
    static error(res, message = 'An error occurred', statusCode = 500, errors) {
        return res.status(statusCode).json({
            success: false,
            message,
            ...(errors && { errors })
        });
    }
}
