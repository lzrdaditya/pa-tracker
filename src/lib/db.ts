import postgres from 'postgres';

let sql: ReturnType<typeof postgres>;

if (typeof window === 'undefined') {
  const connectionString = process.env.DATABASE_URL;
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
