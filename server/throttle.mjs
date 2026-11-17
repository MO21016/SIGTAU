// Límite de intentos fallidos de login (en memoria): tras MAX_FAILS fallos seguidos para la
// misma combinación IP + correo se bloquea durante LOCK_MS. Un login correcto lo reinicia.
import { HttpError } from "./http.mjs";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 60 * 1000;

const attempts = new Map(); // clave -> { fails, first, lockedUntil }

const keyOf = (req, email) => `${req.ip}|${String(email).toLowerCase()}`;

/** Lanza 429 si la clave está bloqueada. */
export function assertNotLocked(req, email) {
  const entry = attempts.get(keyOf(req, email));
  if (entry?.lockedUntil > Date.now()) {
    const seconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    const err = new HttpError(
      429,
      `Demasiados intentos fallidos. Intenta de nuevo en ${seconds} segundos.`,
      { code: "TOO_MANY_ATTEMPTS" },
    );
    err.retryAfter = seconds;
    throw err;
  }
}

export function recordFailure(req, email) {
  const key = keyOf(req, email);
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) entry = { fails: 0, first: now, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.lockedUntil = now + LOCK_MS;
    entry.fails = 0;
    entry.first = now;
  }
  attempts.set(key, entry);
  // Evita que el mapa crezca sin límite.
  if (attempts.size > 5000)
    for (const [k, v] of attempts)
      if (now - v.first > WINDOW_MS && v.lockedUntil < now) attempts.delete(k);
}

export const recordSuccess = (req, email) => attempts.delete(keyOf(req, email));
