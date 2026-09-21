import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./sql";
import { seedCategoriesIfNeeded } from "./categories";

export type AppDb = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

type GlobalDb = {
  dbPromise?: Promise<AppDb>;
};

const globalForDb = globalThis as unknown as GlobalDb;

async function createDb(): Promise<AppDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const pooled = url.includes("-pooler");
    const client = postgres(url, {
      max: pooled ? 1 : 4,
      prepare: !pooled,
      ...(pooled ? { idle_timeout: 20, connect_timeout: 30 } : {}),
    });
    const db = drizzlePg(client, { schema });
    await client.unsafe(SCHEMA_SQL);
    await seedCategoriesIfNeeded(db);
    return db;
  }

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(path.join(dataDir, "pglite"));
  await client.waitReady;
  await client.exec(SCHEMA_SQL);
  const db = drizzlePglite({ client, schema });
  await seedCategoriesIfNeeded(db);
  return db;
}

export function getDb(): Promise<AppDb> {
  if (!globalForDb.dbPromise) {
    globalForDb.dbPromise = createDb();
  }
  return globalForDb.dbPromise;
}
