// Crea la primera cuenta de Coordinación (o restablece su contraseña) sin cargar datos de demostración.
//
//   npm run db:admin -- --email coordinacion@ues.edu.sv --name Rosa --last Chávez
//   npm run db:admin -- --email coordinacion@ues.edu.sv --name Rosa --last Chávez --password "una-clave-segura"
//   npm run db:admin -- --email coordinacion@ues.edu.sv --reset-password
//
// Si no se indica --password se genera una aleatoria y se muestra una sola vez.
// También se puede pasar por la variable SIGTAU_ADMIN_PASSWORD (evita dejarla en el historial del shell).
import { randomBytes } from "node:crypto";
import { hashPassword, openDb } from "./db.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1].trim() : undefined;
};
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

const email = flag("email")?.toLowerCase();
const resetPassword = args.includes("--reset-password");
if (!email || !/^[^@\s]+@ues\.edu\.sv$/.test(email))
  fail("Indica un correo institucional con --email (debe terminar en @ues.edu.sv).");

let password = flag("password") ?? process.env.SIGTAU_ADMIN_PASSWORD;
const generated = !password;
if (generated) password = randomBytes(12).toString("base64url"); // 16 caracteres
if (password.length < 8 || password.length > 200)
  fail("La contraseña debe tener entre 8 y 200 caracteres.");

const db = openDb();
const existing = db.prepare("SELECT id, role FROM users WHERE email = ?").get(email);

if (existing) {
  if (!resetPassword)
    fail(`Ya existe un usuario con ${email}. Usa --reset-password para cambiar su contraseña.`);
  db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?").run(
    hashPassword(password),
    existing.id,
  );
  console.log(
    `✔ Contraseña restablecida para ${email} (${existing.role}); la cuenta queda activa.`,
  );
} else {
  if (resetPassword) fail(`No existe ningún usuario con ${email}.`);
  const name = flag("name");
  const last = flag("last");
  if (!name || !last) fail("Indica --name y --last para crear la cuenta.");
  db.prepare(
    "INSERT INTO users (name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'Coordinación')",
  ).run(name, last, email, hashPassword(password));
  console.log(`✔ Cuenta de Coordinación creada: ${name} ${last} <${email}>`);
}
if (generated)
  console.log(`  Contraseña generada (guárdala ahora, no se vuelve a mostrar): ${password}`);
db.close();
