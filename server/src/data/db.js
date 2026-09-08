import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DB_PATH =
  process.env.DATABASE_PATH ??
  fileURLToPath(new URL("../family.db", import.meta.url));

export const db = new Database(DB_PATH);

db.pragma("foreign_keys = ON");

db.exec(readFileSync(new URL("schema.sql", import.meta.url), "utf8"));