import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  console.warn('DATABASE_URL is not set');
}

export const sql = neon(connectionString);
