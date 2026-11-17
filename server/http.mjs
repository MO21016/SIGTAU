// Errores HTTP, constantes compartidas y el manejador global de errores de la API.
import { randomUUID } from "node:crypto";

/**
 * Error con código HTTP pensado para mostrarse al usuario.
 * `code` es un identificador estable para el cliente; `fields` mapea campo -> mensaje
 * cuando el error es de validación.
 */
export class HttpError extends Error {
  constructor(status, message, { code, fields } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (msg, opts) => new HttpError(400, msg, { code: "BAD_REQUEST", ...opts });
export const unauthorized = (msg) => new HttpError(401, msg, { code: "UNAUTHORIZED" });
export const forbidden = (msg = "No tienes permiso para realizar esta acción.") =>
  new HttpError(403, msg, { code: "FORBIDDEN" });
export const notFound = (msg = "Recurso no encontrado.") =>
  new HttpError(404, msg, { code: "NOT_FOUND" });
export const conflict = (msg) => new HttpError(409, msg, { code: "CONFLICT" });

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const ROLES = ["Estudiante", "Tutor", "Coordinación"];

/** Middleware: asigna un id corto a cada petición (cabecera X-Request-Id) para rastrear errores. */
export function requestId(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.id);
  next();
}

/** Ruta inexistente dentro de /api. */
export const apiNotFound = (_req, _res, next) => next(notFound("Ruta no encontrada."));

// Errores de SQLite -> respuesta comprensible. Los triggers del esquema usan RAISE(ABORT, ...)
// con mensajes ya redactados para el usuario, así que se devuelven tal cual.
function fromSqlite(err) {
  // Un ON DELETE RESTRICT se reporta como SQLITE_CONSTRAINT_TRIGGER con el mensaje técnico de
  // SQLite; se distingue por el texto para no mostrarlo al usuario.
  const code = /FOREIGN KEY/i.test(err.message ?? "") ? "SQLITE_CONSTRAINT_FOREIGNKEY" : err.code;
  switch (code) {
    case "SQLITE_CONSTRAINT_UNIQUE":
    case "SQLITE_CONSTRAINT_PRIMARYKEY":
      return new HttpError(409, "Ya existe un registro con esos datos.", { code: "DUPLICATE" });
    case "SQLITE_CONSTRAINT_FOREIGNKEY":
      return new HttpError(
        409,
        "No se puede completar la acción: el registro está relacionado con otros datos.",
        { code: "RELATED_DATA" },
      );
    case "SQLITE_CONSTRAINT_TRIGGER":
      return new HttpError(409, err.message, { code: "CONFLICT" });
    case "SQLITE_CONSTRAINT_CHECK":
    case "SQLITE_CONSTRAINT_NOTNULL":
      return new HttpError(400, "Los datos enviados no cumplen las reglas de la base de datos.", {
        code: "BAD_REQUEST",
      });
    case "SQLITE_BUSY":
    case "SQLITE_LOCKED":
      return new HttpError(
        503,
        "La base de datos está ocupada. Intenta de nuevo en unos segundos.",
        {
          code: "DB_BUSY",
        },
      );
    default:
      return null;
  }
}

// Errores del parser de JSON de Express (body-parser).
function fromParser(err) {
  switch (err.type) {
    case "entity.parse.failed":
      return badRequest("El cuerpo de la solicitud no es un JSON válido.");
    case "entity.too.large":
      return new HttpError(413, "La solicitud es demasiado grande.", { code: "TOO_LARGE" });
    case "charset.unsupported":
    case "encoding.unsupported":
      return new HttpError(415, "Formato de solicitud no soportado.", { code: "UNSUPPORTED" });
    default:
      return null;
  }
}

/** Manejador global: nunca filtra detalles internos; los 5xx se registran con su id. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const known = err instanceof HttpError ? err : (fromParser(err) ?? fromSqlite(err));
  if (known) {
    const body = { error: known.message };
    if (known.code) body.code = known.code;
    if (known.fields) body.fields = known.fields;
    if (known.status === 429 && known.retryAfter) res.setHeader("Retry-After", known.retryAfter);
    if (known.status >= 500) logUnexpected(err, req);
    return res.status(known.status).json(body);
  }
  logUnexpected(err, req);
  res.status(500).json({
    error: `Error interno del servidor. Si persiste, informa el código ${req.id}.`,
    code: "INTERNAL",
  });
}

function logUnexpected(err, req) {
  const who = req.user ? ` user=${req.user.id}` : "";
  console.error(`✖ [${req.id}] ${req.method} ${req.originalUrl}${who}\n`, err);
}
