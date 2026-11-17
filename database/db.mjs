// Utilidades compartidas por los scripts de base de datos (y reutilizables por la futura API).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const DB_DIR = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(DB_DIR, "schema.sql");
// Se puede cambiar con la variable de entorno SIGTAU_DB (ruta al archivo .db).
export const DB_PATH = process.env.SIGTAU_DB || join(DB_DIR, "sigtau.db");

export function openDb({ mustExist = true } = {}) {
  if (mustExist && !existsSync(DB_PATH)) {
    console.error(
      `✖ No existe la base de datos en ${DB_PATH}\n  Ejecuta primero: npm run db:create`,
    );
    process.exit(1);
  }
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000"); // espera hasta 5 s si otro proceso la tiene bloqueada
  return db;
}

// Hash de contraseñas con scrypt (incluido en Node, sin dependencias extra).
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Los scripts que borran datos (seed, create --reset) se niegan a correr con NODE_ENV=production
 * salvo que se pase --force, para no vaciar una base real por accidente.
 */
export function assertSafeToWipe(command) {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error(
      `✖ ${command} borraría los datos de la base y NODE_ENV=production.\n  Si es realmente lo que quieres, agrega --force.`,
    );
    process.exit(1);
  }
}
