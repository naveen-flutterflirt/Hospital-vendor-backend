import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { errorHandler, AppError } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import crmRoutes from './routes/crm.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import assetsRoutes from './routes/assets.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import vendorsRoutes from './routes/vendors.routes.js';
import transfersRoutes from './routes/transfers.routes.js';
import grnRoutes from './routes/grn.routes.js';
import purchaseOrdersRoutes from './routes/purchaseOrders.routes.js';
import purchaseRequestsRoutes from './routes/purchaseRequests.routes.js';
import rfqQuotesRoutes from './routes/rfqQuotes.routes.js';
import indentsRoutes from './routes/indents.routes.js';
import itemsRoutes from './routes/items.routes.js';
const app = express();
// Security Hardening
app.disable('x-powered-by');
app.set('trust proxy', 1);
// Security and utility middleware
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server or curl requests with no origin
        if (!origin)
            return callback(null, true);
        const allowed = Array.isArray(env.CORS_ORIGIN) ? env.CORS_ORIGIN : [env.CORS_ORIGIN];
        if (env.NODE_ENV === 'development' ||
            allowed.includes(origin) ||
            /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Liveness & Database Health Check
app.get('/health', async (_req, res) => {
    const dbStatus = await db.checkConnection();
    res.status(dbStatus.connected ? 200 : 503).json({
        status: dbStatus.connected ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        database: dbStatus,
    });
});
app.get(`${env.API_PREFIX}/health`, async (_req, res) => {
    const dbStatus = await db.checkConnection();
    res.status(dbStatus.connected ? 200 : 503).json({
        status: dbStatus.connected ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: dbStatus,
    });
});
// Mount API Routes
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${env.API_PREFIX}/settings`, settingsRoutes);
app.use(`${env.API_PREFIX}/reports`, reportsRoutes);
app.use(`${env.API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${env.API_PREFIX}/assets`, assetsRoutes);
app.use(`${env.API_PREFIX}/invoices`, invoicesRoutes);
app.use(`${env.API_PREFIX}/vendors`, vendorsRoutes);
app.use(`${env.API_PREFIX}/transfers`, transfersRoutes);
app.use(`${env.API_PREFIX}/grn`, grnRoutes);
app.use(`${env.API_PREFIX}/purchase-orders`, purchaseOrdersRoutes);
app.use(`${env.API_PREFIX}/purchase-requests`, purchaseRequestsRoutes);
app.use(`${env.API_PREFIX}/rfq-quotes`, rfqQuotesRoutes);
app.use(`${env.API_PREFIX}/indents`, indentsRoutes);
app.use(`${env.API_PREFIX}/items`, itemsRoutes);
app.use(`${env.API_PREFIX}`, crmRoutes);
// Catch-all 404 for undefined routes
app.use('*', (req, _res, next) => {
    next(new AppError(`Cannot ${req.method} ${req.originalUrl} - Route not found`, 404));
});
// Centralized error handler
app.use(errorHandler);
// Start server only when running as a standalone process (not on Vercel serverless)
if (!process.env.VERCEL) {
    const server = app.listen(env.PORT, '0.0.0.0', () => {
        console.log(`🚀 [Hospital CRM Backend] Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
        console.log(`🔗 API Base URL: http://localhost:${env.PORT}${env.API_PREFIX}`);
        console.log(`🩺 Health check: http://localhost:${env.PORT}/health`);
    });
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
        server.close(async () => {
            try {
                await db.close();
                console.log('✅ PostgreSQL connection pool closed.');
                process.exit(0);
            }
            catch (err) {
                console.error('❌ Error during database pool shutdown:', err);
                process.exit(1);
            }
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
export default app;
