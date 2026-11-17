// Horarios: el Tutor gestiona los suyos; Coordinación ajusta cupos.
import { Router } from "express";
import { requireRole } from "../auth.mjs";
import { DAYS, badRequest, conflict, forbidden, notFound } from "../http.mjs";
import { Validator, body, id, parseId } from "../validate.mjs";

const DEFAULT_CAPACITY = 10;
const MAX_CAPACITY = 500;

export default function scheduleRoutes(db, auth) {
  const router = Router();
  router.use(auth);

  function fields(b) {
    const v = new Validator();
    const subjectId = v.ref(b.subjectId, "subjectId", "La asignatura");
    if (subjectId && !db.prepare("SELECT 1 FROM subjects WHERE id = ?").get(subjectId))
      v.fail("subjectId", "La asignatura no existe.");
    const day = v.oneOf(b.day, "day", "El día", DAYS);
    const start = v.time(b.start, "start", "La hora de inicio");
    const end = v.time(b.end, "end", "La hora de fin");
    if (start && end && end <= start)
      v.fail("end", "La hora de finalización debe ser posterior a la hora de inicio.");
    v.done();
    return { subjectId, day, start, end };
  }
  const OVERLAP = "Este horario se superpone con otra disponibilidad del mismo día.";
  const overlaps = (tutorId, f, exceptId = 0) =>
    db
      .prepare(
        `SELECT 1 FROM schedules WHERE tutor_id = ? AND id <> ? AND day = ? AND start_time < ? AND end_time > ?`,
      )
      .get(tutorId, exceptId, f.day, f.end, f.start);
  const ownSchedule = (req) => {
    const s = db
      .prepare("SELECT * FROM schedules WHERE id = ?")
      .get(id(req.params.id, "El horario"));
    if (!s) throw notFound("Horario no encontrado.");
    if (s.tutor_id !== req.user.id) throw forbidden("Este horario pertenece a otro tutor.");
    return s;
  };
  const row = (scheduleId) =>
    db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM requests r WHERE r.schedule_id = s.id AND r.status = 'Aprobada') AS approved
         FROM schedules s WHERE s.id = ?`,
      )
      .get(scheduleId);

  // Coordinación: guarda todos los cupos a la vez. Body: { capacities: { "<scheduleId>": n } }
  // Se valida todo antes de escribir, así un valor inválido no deja cambios a medias.
  router.put("/capacities", requireRole("Coordinación"), (req, res) => {
    const { capacities } = body(req);
    if (!capacities || typeof capacities !== "object" || Array.isArray(capacities))
      throw badRequest("Los cupos deben enviarse como un objeto { horario: cupo }.");
    const entries = Object.entries(capacities);
    if (entries.length > 1000) throw badRequest("Demasiados horarios en una sola solicitud.");

    const update = db.transaction(() => {
      for (const [key, value] of entries) {
        const scheduleId = parseId(key);
        const s = scheduleId && row(scheduleId);
        if (!s) throw notFound("Horario no encontrado.");
        const name = db.prepare("SELECT name FROM subjects WHERE id = ?").get(s.subject_id).name;
        if (!Number.isInteger(value) || value < 1 || value > MAX_CAPACITY)
          throw badRequest(
            `El cupo de ${name} debe ser un número entero entre 1 y ${MAX_CAPACITY}.`,
          );
        if (value < s.approved)
          throw badRequest(
            `Revisa el cupo de ${name}: no puede ser menor a las solicitudes aprobadas.`,
          );
        db.prepare("UPDATE schedules SET capacity = ? WHERE id = ?").run(value, s.id);
      }
    });
    update();
    res.json({ updated: entries.length });
  });

  router.post("/", requireRole("Tutor"), (req, res) => {
    const f = fields(body(req));
    if (overlaps(req.user.id, f)) throw conflict(OVERLAP);
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO schedules (tutor_id, subject_id, day, start_time, end_time, capacity) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(req.user.id, f.subjectId, f.day, f.start, f.end, DEFAULT_CAPACITY);
    res.status(201).json({ id: lastInsertRowid });
  });

  router.put("/:id", requireRole("Tutor"), (req, res) => {
    const s = ownSchedule(req);
    const f = fields(body(req));
    if (overlaps(req.user.id, f, s.id)) throw conflict(OVERLAP);
    db.prepare(
      "UPDATE schedules SET subject_id = ?, day = ?, start_time = ?, end_time = ? WHERE id = ?",
    ).run(f.subjectId, f.day, f.start, f.end, s.id);
    res.json({ id: s.id });
  });

  router.delete("/:id", requireRole("Tutor"), (req, res) => {
    const s = ownSchedule(req);
    const approved = db
      .prepare("SELECT 1 FROM requests WHERE schedule_id = ? AND status = 'Aprobada'")
      .get(s.id);
    if (approved) throw conflict("No se puede eliminar: este horario tiene solicitudes aprobadas.");
    if (db.prepare("SELECT 1 FROM requests WHERE schedule_id = ?").get(s.id))
      throw conflict("No se puede eliminar: este horario ya tiene solicitudes registradas.");
    db.prepare("DELETE FROM schedules WHERE id = ?").run(s.id);
    res.status(204).end();
  });

  return router;
}
