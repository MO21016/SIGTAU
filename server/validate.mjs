// Validación de datos de entrada. A diferencia de lanzar en el primer fallo, `Validator`
// acumula los errores de todos los campos y los devuelve juntos en `fields`.
import { HttpError, badRequest } from "./http.mjs";

export const EMAIL_RE = /^[^@\s]+@ues\.edu\.sv$/i;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FILE_EXT = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];

// Caracteres de control (se permiten \t \n \r solo en textos multilínea).
const CONTROL_ANY = /[\u0000-\u001f\u007f]/;
const CONTROL_NO_WS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Id positivo: número entero o cadena de solo dígitos ("12"). Rechaza true, "1e0", "1.5", etc. */
export function parseId(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 1 ? value : null;
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) {
    const n = Number(value);
    return n >= 1 ? n : null;
  }
  return null;
}

/** Id de un parámetro de ruta; lanza 400 si no es válido. */
export function id(value, label = "El identificador") {
  const n = parseId(value);
  if (n === null) throw badRequest(`${label} no es válido.`);
  return n;
}

/** El cuerpo debe ser un objeto JSON (no vacío, arreglo ni valor suelto). */
export function body(req) {
  const b = req.body;
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw badRequest("El cuerpo de la solicitud debe ser un objeto JSON.");
  return b;
}

/** Fecha local en formato YYYY-MM-DD (sin pasar por UTC). */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDate(d);
};

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export const weekday = (date) => new Date(`${date}T12:00:00`).getDay();

export class Validator {
  errors = {};

  /** Registra un error para el campo (solo el primero de cada campo). */
  fail(field, message) {
    this.errors[field] ??= message;
  }

  /** Lanza 400 con todos los errores acumulados, si los hay. */
  done() {
    const fields = this.errors;
    const messages = Object.values(fields);
    if (!messages.length) return;
    throw new HttpError(400, messages.join(" "), { code: "VALIDATION", fields });
  }

  /** Texto obligatorio. Devuelve el valor sin espacios sobrantes (o undefined si es inválido). */
  string(value, field, label, { min = 1, max = 200, multiline = false, lengthMessage } = {}) {
    if (typeof value !== "string") return void this.fail(field, `${label} es obligatorio.`);
    const v = value.trim();
    if (!v) return void this.fail(field, `${label} es obligatorio.`);
    if (v.length < min || v.length > max)
      return void this.fail(
        field,
        lengthMessage ??
          (v.length < min
            ? `${label} debe tener al menos ${min} caracteres.`
            : `${label} no puede superar ${max} caracteres.`),
      );
    if ((multiline ? CONTROL_NO_WS : CONTROL_ANY).test(v))
      return void this.fail(field, `${label} contiene caracteres no permitidos.`);
    return v;
  }

  /** Texto opcional: vacío/null/ausente -> null. */
  optionalString(value, field, label, opts = {}) {
    if (value == null || (typeof value === "string" && !value.trim())) return null;
    return this.string(value, field, label, opts) ?? null;
  }

  email(value, field = "email") {
    const v = this.string(value, field, "El correo", { max: 150 })?.toLowerCase();
    if (v && !EMAIL_RE.test(v))
      return void this.fail(field, "El correo debe ser institucional (@ues.edu.sv).");
    return v;
  }

  oneOf(value, field, label, list) {
    if (!list.includes(value)) return void this.fail(field, `${label} no es válido.`);
    return value;
  }

  bool(value, field, message) {
    if (typeof value !== "boolean") return void this.fail(field, message);
    return value;
  }

  int(value, field, label, { min = 1, max = 1_000_000 } = {}) {
    if (!Number.isInteger(value) || value < min || value > max)
      return void this.fail(field, `${label} debe ser un número entero entre ${min} y ${max}.`);
    return value;
  }

  /** Referencia a un registro (id numérico en el cuerpo). */
  ref(value, field, label) {
    const n = parseId(value);
    if (n === null) return void this.fail(field, `${label} no es válido.`);
    return n;
  }

  /** Fecha real YYYY-MM-DD (rechaza 2026-02-30, 2026-13-01, etc.). */
  date(value, field, label) {
    if (typeof value !== "string" || !DATE_RE.test(value))
      return void this.fail(field, `${label} debe tener el formato AAAA-MM-DD.`);
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime()) || localDate(d) !== value)
      return void this.fail(field, `${label} no es una fecha válida.`);
    return value;
  }

  time(value, field, label) {
    if (typeof value !== "string" || !TIME_RE.test(value))
      return void this.fail(field, `${label} debe tener el formato HH:MM.`);
    return value;
  }

  /** Nombres de archivos adjuntos: máx. 3, extensión permitida, sin rutas ni caracteres de control. */
  fileNames(value, field = "files") {
    if (value == null) return [];
    if (!Array.isArray(value))
      return void this.fail(field, "Los archivos adjuntos no son válidos.");
    const names = [];
    for (const f of value) {
      const name = typeof f === "string" ? f.trim() : "";
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      if (!name || name.length > 255 || /[\\/]/.test(name) || CONTROL_ANY.test(name))
        return void this.fail(field, "Los archivos adjuntos no son válidos.");
      if (!ALLOWED_FILE_EXT.includes(ext))
        return void this.fail(field, "Los archivos deben ser PDF, DOCX, PNG o JPG.");
      names.push(name);
    }
    const unique = [...new Set(names)];
    if (unique.length > 3) return void this.fail(field, "Puedes adjuntar un máximo de 3 archivos.");
    return unique;
  }
}
