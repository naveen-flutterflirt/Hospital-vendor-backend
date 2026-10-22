import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
export const env = {
    PORT: parseInt(process.env.PORT || '5001', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    API_PREFIX: process.env.API_PREFIX || '/api/v1',
    CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
    // Database credentials
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://pranjalsoni@localhost:5432/hospital_crm_db',
    PGHOST: process.env.PGHOST || 'localhost',
    PGPORT: parseInt(process.env.PGPORT || '5432', 10),
    PGDATABASE: process.env.PGDATABASE || 'hospital_crm_db',
    PGUSER: process.env.PGUSER || 'pranjalsoni',
    PGPASSWORD: process.env.PGPASSWORD || '',
    // Security
    JWT_SECRET: process.env.JWT_SECRET || 'hospital_crm_jwt_default_secret_key_2026',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};
