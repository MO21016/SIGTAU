// Solicitudes de tutoría: crear/cancelar (Estudiante), aprobar/rechazar y registrar resultado (Tutor).
import { Router } from "express";
import { requireRole } from "../auth.mjs";
import { DAYS, conflict, forbidden, notFound } from "../http.mjs";
import { notify } from "../notify.mjs";
import { Validator, addDays, body, id, localDate, weekday } from "../validate.mjs";

const DAY_MS = 86_400_000;
const MAX_DAYS_AHEAD = 180;

export default function requestRoutes(db, auth) {
  const router = Router();
  router.use(auth);

  // Solicitud + datos de su horario y asignatura, o 404.
  const load = (reqId) => {
    const r = db
      .prepare(
        `SELECT r.*, s.tutor_id, s.day, s.start_time, s.capacity, sub.name AS subject_name
         FROM requests r
         JOIN schedules s ON s.id = r.schedule_id
         JOIN subjects sub ON sub.id = s.subject_id
         WHERE r.id = ?`,
      )
      .get(reqId);
    if (!r) throw notFound("Solicitud no encontrada.");
    return r;
  };
  const ownedByTutor = (r, user) => {
    if (r.tutor_id !== user.id) throw forbidden("Esta solicitud pertenece a otro tutor.");
  };
  const approvedOn = (scheduleId, date) =>
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM requests WHERE schedule_id = ? AND session_date = ? AND status = 'Aprobada'",
      )
      .get(scheduleId, date).n;

  router.post("/", requireRole("Estudiante"), (req, res) => {
    const b = body(req);
    const v = new Validator();
    const scheduleId = v.ref(b.scheduleId, "scheduleId", "El horario");
    const date = v.date(b.date, "date", "La fecha");
    const topics = v.string(b.topics, "topics", "Los temas", {
      min: 20,
      max: 1000,
      multiline: true,
      lengthMessage: "Escribe entre 20 y 1000 caracteres.",
    });
    const files = v.fileNames(b.files);

    const s =
      scheduleId &&
      db
        .prepare(
          `SELECT s.*, sub.name AS subject_name, u.active AS tutor_active
           FROM schedules s
           JOIN subjects sub ON sub.id = s.subject_id
           JOIN users u ON u.id = s.tutor_id
           WHERE s.id = ?`,
        )
        .get(scheduleId);
    if (scheduleId && !s) v.fail("scheduleId", "El horario no existe.");

    // La sesión debe ser posterior a hoy, no estar demasiado lejos y caer en el día del horario.
    if (s && date) {
      if (date <= localDate()) v.fail("date", "Selecciona una fecha futura (a partir de mañana).");
      else if (date > addDays(MAX_DAYS_AHEAD))
        v.fail("date", `La fecha no puede superar los ${MAX_DAYS_AHEAD} días a partir de hoy.`);
      else if (weekday(date) !== DAYS.indexOf(s.day) + 1)
        v.fail("date", `Selecciona una fecha futura que sea ${s.day.toLowerCase()}.`);
    }
    v.done();

    if (!s.tutor_active) throw conflict("El tutor de este horario ya no está disponible.");
    if (
      db
        .prepare(
          `SELECT 1 FROM requests WHERE student_id = ? AND schedule_id = ? AND session_date = ?
           AND status IN ('Pendiente', 'Aprobada')`,
        )
        .get(req.user.id, s.id, date)
    )
      throw conflict("Ya tienes una solicitud activa para esta sesión.");
    if (approvedOn(s.id, date) >= s.capacity)
      throw conflict("Esta sesión ya no tiene cupos disponibles para esa fecha.");

    const create = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO requests (student_id, schedule_id, session_date, topics) VALUES (?, ?, ?, ?)",
        )
        .run(req.user.id, s.id, date, topics);
      const insFile = db.prepare("INSERT INTO request_files (request_id, file_name) VALUES (?, ?)");
      files.forEach((name) => insFile.run(lastInsertRowid, name));
      notify(
        db,
        s.tutor_id,
        `${req.user.name} ${req.user.last_name} envió una nueva solicitud de ${s.subject_name}.`,
        "received",
      );
      return lastInsertRowid;
    });
    res.status(201).json({ id: create() });
  });

  router.patch("/:id/cancel", requireRole("Estudiante"), (req, res) => {
    const r = load(id(req.params.id, "La solicitud"));
    if (r.student_id !== req.user.id)
      throw forbidden("Esta solicitud pertenece a otro estudiante.");
    if (!["Pendiente", "Aprobada"].includes(r.status))
      throw conflict("Solo se pueden cancelar solicitudes pendientes o aprobadas.");
    const session = new Date(`${r.session_date}T${r.start_time}:00`);
    if (session.getTime() - Date.now() < DAY_MS)
      throw conflict("No es posible cancelar con menos de 24 horas de anticipación.");
    db.transaction(() => {
      db.prepare("UPDATE requests SET status = 'Cancelada' WHERE id = ?").run(r.id);
      notify(
        db,
        r.tutor_id,
        `${req.user.name} canceló su solicitud de ${r.subject_name}.`,
        "received",
      );
    })();
    res.json({ id: r.id, status: "Cancelada" });
  });

  router.patch("/:id/status", requireRole("Tutor"), (req, res) => {
    const v = new Validator();
    const status = v.oneOf(body(req).status, "status", "El estado", ["Aprobada", "Rechazada"]);
    v.done();
    const r = load(id(req.params.id, "La solicitud"));
    ownedByTutor(r, req.user);
    if (r.status !== "Pendiente")
      throw conflict("Solo se pueden responder solicitudes pendientes.");
    if (status === "Aprobada" && approvedOn(r.schedule_id, r.session_date) >= r.capacity)
      throw conflict("No se puede aprobar: la capacidad para esa sesión está completa.");
    db.transaction(() => {
      db.prepare("UPDATE requests SET status = ? WHERE id = ?").run(status, r.id);
      notify(
        db,
        r.student_id,
        `Tu solicitud de ${r.subject_name} fue ${status.toLowerCase()}.`,
        "requests",
      );
    })();
    res.json({ id: r.id, status });
  });

  router.put("/:id/result", requireRole("Tutor"), (req, res) => {
    const b = body(req);
    const v = new Validator();
    const attendance = v.bool(b.attendance, "attendance", "Selecciona la asistencia.");
    const comprehension = ["Bajo", "Medio", "Alto"].includes(b.comprehension)
      ? b.comprehension
      : void v.fail("comprehension", "Selecciona el nivel de comprensión.");
    const observations = v.optionalString(b.observations, "observations", "Las observaciones", {
      max: 2000,
      multiline: true,
    });
    v.done();

    const r = load(id(req.params.id, "La solicitud"));
    ownedByTutor(r, req.user);
    if (r.status !== "Aprobada")
      throw conflict("Solo se registra el resultado de sesiones aprobadas.");
    if (new Date(`${r.session_date}T23:59:59`) >= new Date())
      throw conflict("La sesión aún no ha terminado.");
    db.transaction(() => {
      db.prepare(
        `UPDATE requests SET status = 'Realizada', attendance = ?, comprehension = ?, observations = ? WHERE id = ?`,
      ).run(
        attendance ? 1 : 0,
        comprehension,
        observations ?? "Sin observaciones adicionales.",
        r.id,
      );
      notify(
        db,
        r.student_id,
        `El resultado de tu tutoría de ${r.subject_name} ya está disponible.`,
        "requests",
      );
    })();
    res.json({ id: r.id, status: "Realizada" });
  });

  return router;
}
