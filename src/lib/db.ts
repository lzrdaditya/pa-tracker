import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

let sql: ReturnType<typeof postgres>;

if (typeof window === 'undefined') {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^DATABASE_URL\s*=\s*["']?(.*?)["']?$/m);
        if (match && match[1]) {
          connectionString = match[1].trim();
        }
      }
    } catch (e) {
      console.warn("Could not read local .env file:", e);
    }
  }

  if (!connectionString) {
    console.warn("DATABASE_URL is not set");
  }

  sql = postgres(connectionString || '', {
    ssl: { rejectUnauthorized: false },
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
} else {
  sql = (() => {
    throw new Error("Database client cannot be used on the client side directly.");
  }) as any;
}

export { sql };
