// Cliente de la API local (server/). Vite reenvía /api al servidor en desarrollo.
import type { Notice, Request, Role, Schedule, Subject, User } from "./App";

export class ApiError extends Error {
  status: number;
  /** Código estable del servidor (VALIDATION, CONFLICT, DUPLICATE, ...), si lo hay. */
  code?: string;
  /** Errores de validación por campo: { campo: mensaje }. */
  fields?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    extra: { code?: string; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.status = status;
    this.code = extra.code;
    this.fields = extra.fields;
  }
  /** Errores que el usuario puede corregir (datos inválidos o en conflicto). */
  get isUserError() {
    return this.status === 400 || this.status === 409 || this.status === 422;
  }
}

const NO_CONNECTION = "No se pudo conectar con el servidor. Verifica que la API esté en ejecución.";
const TIMEOUT_MS = 15_000;

// Mensaje por defecto cuando el servidor no envía uno propio.
const STATUS_MESSAGES: Record<number, string> = {
  400: "Los datos enviados no son válidos.",
  401: "Tu sesión no es válida o expiró. Inicia sesión de nuevo.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No se encontró lo que buscabas. Puede haber sido eliminado.",
  409: "La acción entra en conflicto con el estado actual de los datos.",
  413: "La solicitud es demasiado grande.",
  429: "Demasiados intentos. Espera un momento e intenta de nuevo.",
};

/** Mensaje legible para cualquier error capturado. */
export const errorMessage = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Ocurrió un error inesperado.";

let token: string | null = null;
let onUnauthorized: () => void = () => {};

/** Se llama cuando el servidor rechaza el token (sesión vencida o reinicio con otro secreto). */
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function call<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(
      0,
      e instanceof DOMException && e.name === "AbortError"
        ? "El servidor tardó demasiado en responder. Intenta de nuevo."
        : NO_CONNECTION,
    );
  } finally {
    window.clearTimeout(timer);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) {
    if (res.status !== 204 && data === null)
      throw new ApiError(res.status, "El servidor devolvió una respuesta inesperada.");
    return data as T;
  }

  if (res.status === 401 && token) {
    token = null;
    onUnauthorized();
  }
  // Un 5xx sin cuerpo JSON no viene de la API: es el proxy de Vite sin servidor detrás.
  if (res.status >= 500 && !data?.error) throw new ApiError(res.status, NO_CONNECTION);
  throw new ApiError(
    res.status,
    data?.error || STATUS_MESSAGES[res.status] || "Ocurrió un error inesperado.",
    { code: data?.code, fields: data?.fields },
  );
}

export type Bootstrap = {
  me: User;
  users: User[];
  subjects: Subject[];
  schedules: Schedule[];
  requests: Request[];
  notices: Notice[];
};

export type UserInput = {
  name: string;
  last: string;
  email: string;
  role: Role;
  career: string;
};
export type ScheduleInput = { subjectId: number; day: string; start: string; end: string };

export const api = {
  async login(email: string, password: string) {
    const r = await call<{ token: string; user: User }>("POST", "/auth/login", { email, password });
    token = r.token;
    return r.user;
  },
  logout() {
    token = null;
  },
  bootstrap: () => call<Bootstrap>("GET", "/bootstrap"),

  createRequest: (r: { scheduleId: number; date: string; topics: string; files: string[] }) =>
    call("POST", "/requests", r),
  cancelRequest: (id: number) => call("PATCH", `/requests/${id}/cancel`),
  respondRequest: (id: number, status: "Aprobada" | "Rechazada") =>
    call("PATCH", `/requests/${id}/status`, { status }),
  saveResult: (
    id: number,
    r: { attendance: boolean; comprehension: string; observations: string },
  ) => call("PUT", `/requests/${id}/result`, r),

  createSchedule: (s: ScheduleInput) => call("POST", "/schedules", s),
  updateSchedule: (id: number, s: ScheduleInput) => call("PUT", `/schedules/${id}`, s),
  deleteSchedule: (id: number) => call("DELETE", `/schedules/${id}`),
  saveCapacities: (capacities: Record<number, number>) =>
    call("PUT", "/schedules/capacities", { capacities }),

  createUser: (u: UserInput) => call("POST", "/users", u),
  updateUser: (id: number, u: UserInput) => call("PUT", `/users/${id}`, u),
  setUserActive: (id: number, active: boolean) => call("PATCH", `/users/${id}/active`, { active }),
  createSubject: (code: string, name: string) => call("POST", "/subjects", { code, name }),

  markNoticeRead: (id: number) => call("PATCH", `/notifications/${id}/read`),
  markAllNoticesRead: () => call("POST", "/notifications/read-all"),
};
