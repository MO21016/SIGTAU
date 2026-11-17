// Script de creación: genera database/sigtau.db a partir de database/schema.sql
//   npm run db:create            -> crea la base de datos (falla si ya existe)
//   npm run db:create -- --reset -> la borra y la vuelve a crear vacía
import { existsSync, readFileSync, rmSync } from "node:fs";
import { DB_PATH, SCHEMA_PATH, assertSafeToWipe, openDb } from "./db.mjs";

const reset = process.argv.includes("--reset");
if (reset) assertSafeToWipe("db:create --reset");

if (existsSync(DB_PATH)) {
  if (!reset) {
    console.error(
      `✖ La base de datos ya existe: ${DB_PATH}\n  Usa "npm run db:create -- --reset" para recrearla (se perderán los datos).`,
    );
    process.exit(1);
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
  console.log("• Base de datos anterior eliminada");
}

const db = openDb({ mustExist: false });
db.exec(readFileSync(SCHEMA_PATH, "utf8"));

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all()
  .map((t) => t.name);
db.close();

console.log(`✔ Base de datos creada en ${DB_PATH}`);
console.log(`  Tablas: ${tables.join(", ")}`);
console.log("  Siguiente paso: npm run db:seed");
