import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// A single pooled connection shared across requests — Next.js keeps this
// module cached between requests in the same server process.
const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
