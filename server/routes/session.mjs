// POST /api/auth/login  ·  GET /api/bootstrap
import { Router } from "express";
import { hashPassword, verifyPassword } from "../../database/db.mjs";
import { authenticate, issueToken } from "../auth.mjs";
import { unauthorized } from "../http.mjs";
import { assertNotLocked, recordFailure, recordSuccess } from "../throttle.mjs";
import { Validator, body } from "../validate.mjs";
import { noticeOut, requestOut, scheduleOut, subjectOut, userOut } from "../serialize.mjs";

const BAD_LOGIN = "Correo o contraseña incorrectos. Revisa los datos e intenta de nuevo.";
// Se verifica contra este hash cuando el correo no existe, para que la respuesta tarde lo mismo
// y no permita descubrir qué correos están registrados.
const DUMMY_HASH = hashPassword("sigtau-dummy-password");

export default function sessionRoutes(db) {
  const router = Router();

  router.post("/auth/login", (req, res) => {
    const b = body(req);
    const v = new Validator();
    const email = v.string(b.email, "email", "El correo", { max: 150 })?.toLowerCase();
    const password =
      typeof b.password === "string" && b.password.length > 0 && b.password.length <= 200
        ? b.password
        : void v.fail("password", "La contraseña es obligatoria.");
    v.done();

    assertNotLocked(req, email);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const valid = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid || !user.active) {
      recordFailure(req, email);
      throw unauthorized(BAD_LOGIN);
    }
    recordSuccess(req, email);
    res.json({ token: issueToken(user.id), user: userOut(user) });
  });

  // Todo lo que el frontend necesita para el usuario autenticado, filtrado por rol.
  router.get("/bootstrap", authenticate(db), (req, res) => {
    const me = req.user;

    const requests =
      me.role === "Estudiante"
        ? db.prepare("SELECT * FROM requests WHERE student_id = ?").all(me.id)
        : me.role === "Tutor"
          ? db
              .prepare(
                `SELECT r.* FROM requests r JOIN schedules s ON s.id = r.schedule_id WHERE s.tutor_id = ?`,
              )
              .all(me.id)
          : db.prepare("SELECT * FROM requests").all();
    // Más recientes primero; el desempate por id conserva el orden de los datos iniciales.
    requests.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id - b.id);

    const filesByRequest = new Map();
    for (const f of db
      .prepare("SELECT request_id, file_name FROM request_files ORDER BY id")
      .all()) {
      if (!filesByRequest.has(f.request_id)) filesByRequest.set(f.request_id, []);
      filesByRequest.get(f.request_id).push(f.file_name);
    }

    // Usuarios visibles: coordinación ve todos; el resto solo tutores, él mismo y,
    // para un tutor, los estudiantes que le han hecho solicitudes (con su correo).
    const allUsers = db.prepare("SELECT * FROM users ORDER BY id").all();
    const myStudents = new Set(requests.map((r) => r.student_id));
    const users =
      me.role === "Coordinación"
        ? allUsers.map((u) => userOut(u))
        : allUsers
            .filter((u) => u.role === "Tutor" || u.id === me.id || myStudents.has(u.id))
            .map((u) =>
              userOut(u, {
                withEmail: u.id === me.id || (me.role === "Tutor" && myStudents.has(u.id)),
              }),
            );

    const schedules = db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM requests r WHERE r.schedule_id = s.id AND r.status = 'Aprobada') AS approved
         FROM schedules s ORDER BY s.id`,
      )
      .all()
      .map(scheduleOut);

    const notices = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC")
      .all(me.id)
      .map(noticeOut);

    res.json({
      me: userOut(me),
      users,
      subjects: db.prepare("SELECT * FROM subjects ORDER BY id").all().map(subjectOut),
      schedules,
      requests: requests.map((r) => requestOut(r, filesByRequest.get(r.id) ?? [])),
      notices,
    });
  });

  return router;
}
