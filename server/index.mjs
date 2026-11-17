// Servidor de SIGTAU: API REST (/api) y, si existe el build (dist/), también el frontend.
//   Desarrollo:  npm run dev:full      Producción:  npm run build && npm start
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { DB_PATH, openDb } from "../database/db.mjs";
import { authenticate } from "./auth.mjs";
import { apiNotFound, errorHandler, requestId } from "./http.mjs";
import adminRoutes from "./routes/admin.mjs";
import notificationRoutes from "./routes/notifications.mjs";
import requestRoutes from "./routes/requests.mjs";
import scheduleRoutes from "./routes/schedules.mjs";
import sessionRoutes from "./routes/session.mjs";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
// Por defecto solo acepta conexiones locales. Detrás de un proxy inverso se deja así;
// en un contenedor o en un servicio gestionado se usa API_HOST=0.0.0.0.
const HOST = process.env.API_HOST || "127.0.0.1";
const IS_PROD = process.env.NODE_ENV === "production";
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SERVE_FRONTEND = existsSync(join(DIST, "index.html"));

if (IS_PROD && !process.env.SIGTAU_SECRET)
  console.warn(
    "! SIGTAU_SECRET no está definido: se usará server/.secret. En producción conviene definirlo\n  como variable de entorno (si el disco no es persistente, las sesiones se invalidarán al reiniciar).",
  );

const db = openDb();
const auth = authenticate(db);

const app = express();
app.disable("x-powered-by");
// Detrás de nginx/Caddy/un balanceador: TRUST_PROXY=1 para que req.ip sea la IP real del cliente.
if (process.env.TRUST_PROXY)
  app.set(
    "trust proxy",
    /^\d+$/.test(process.env.TRUST_PROXY)
      ? Number(process.env.TRUST_PROXY)
      : process.env.TRUST_PROXY,
  );
app.use(requestId);
app.use(express.json({ limit: "100kb" }));

const api = express.Router();
// Comprobación de salud (sin autenticación): útil para balanceadores y servicios gestionados.
api.get("/health", (_req, res) => {
  db.prepare("SELECT 1").get(); // si la base no responde, el manejador global devuelve 500
  res.json({ status: "ok" });
});
api.use(sessionRoutes(db));
api.use(adminRoutes(db, auth));
api.use("/schedules", scheduleRoutes(db, auth));
api.use("/requests", requestRoutes(db, auth));
api.use("/notifications", notificationRoutes(db, auth));
api.use(apiNotFound);
app.use("/api", api);

// Frontend compilado (solo si se ejecutó `npm run build`): archivos estáticos + fallback a index.html.
if (SERVE_FRONTEND) {
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
    next();
  });
  app.use(
    express.static(DIST, {
      // Los archivos de /assets llevan hash en el nombre: se pueden cachear sin límite.
      setHeaders: (res, file) =>
        res.setHeader(
          "Cache-Control",
          file.includes(`${join(DIST, "assets")}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        ),
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(join(DIST, "index.html"));
  });
}

app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  console.log(
    `✔ SIGTAU escuchando en http://${HOST}:${PORT}  (${IS_PROD ? "producción" : "desarrollo"})`,
  );
  console.log(
    `  API: /api${SERVE_FRONTEND ? "  ·  Frontend: dist/ servido por este mismo proceso" : ""}`,
  );
  console.log(`  Base de datos: ${DB_PATH}`);
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE" ? `✖ El puerto ${PORT} ya está en uso (cambia API_PORT).` : e,
  );
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });

// Errores que escaparon de cualquier manejador: registrar y salir (con `api:watch` se reinicia solo).
process.on("unhandledRejection", (reason) => {
  console.error("✖ Promesa rechazada sin manejar:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("✖ Excepción no capturada:", err);
  process.exit(1);
});
