// Autenticación con tokens firmados (HMAC-SHA256), sin dependencias extra.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { forbidden, unauthorized } from "./http.mjs";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// El secreto se toma de SIGTAU_SECRET o se genera una vez y se guarda en server/.secret
// (así las sesiones sobreviven a reinicios del servidor en desarrollo).
function loadSecret() {
  if (process.env.SIGTAU_SECRET) return process.env.SIGTAU_SECRET;
  const file = join(dirname(fileURLToPath(import.meta.url)), ".secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
const SECRET = loadSecret();

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const sign = (data) => createHmac("sha256", SECRET).update(data).digest();

export function issueToken(userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${b64(sign(payload))}`;
}

function readToken(token) {
  const [payload, sig] = String(token).split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// Middleware: exige "Authorization: Bearer <token>" y carga req.user desde la BD.
export const authenticate = (db) => (req, _res, next) => {
  const header = req.headers.authorization || "";
  const data = header.startsWith("Bearer ") ? readToken(header.slice(7)) : null;
  const user = data && db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(data.uid);
  if (!user) throw unauthorized("Tu sesión no es válida o expiró. Inicia sesión de nuevo.");
  req.user = user;
  next();
};

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
