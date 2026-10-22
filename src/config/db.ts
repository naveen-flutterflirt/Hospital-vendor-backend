import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from './env.js';

const isRemoteDb = env.DATABASE_URL.includes('neon.tech') || 
                    env.DATABASE_URL.includes('sslmode=require') || 
                    !env.DATABASE_URL.includes('localhost');

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  max: 20, // max connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err);
});

export const db = {
  /**
   * Execute parameterized query against Postgres pool
   */
  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (env.NODE_ENV === 'development' && duration > 100) {
        console.log(`[SQL Slow Query] (${duration}ms): ${text.replace(/\s+/g, ' ').slice(0, 80)}...`);
      }
      return res;
    } catch (error) {
      console.error('[SQL Error]:', { text, error });
      throw error;
    }
  },

  /**
   * Check connection to PostgreSQL database
   */
  async checkConnection(): Promise<{ connected: boolean; database?: string; version?: string; error?: string }> {
    try {
      const res = await pool.query('SELECT current_database() as db, version() as ver;');
      return {
        connected: true,
        database: res.rows[0]?.db,
        version: res.rows[0]?.ver,
      };
    } catch (err: any) {
      return {
        connected: false,
        error: err.message || 'Database connection failed',
      };
    }
  },

  /**
   * Close pool on shutdown
   */
  async close(): Promise<void> {
    await pool.end();
  }
};
