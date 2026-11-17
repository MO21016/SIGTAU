// Gestión de usuarios y asignaturas (solo Coordinación).
import { Router } from "express";
import { hashPassword } from "../../database/db.mjs";
import { requireRole } from "../auth.mjs";
import { HttpError, ROLES, conflict, notFound } from "../http.mjs";
import { subjectOut, userOut } from "../serialize.mjs";
import { Validator, body, id } from "../validate.mjs";

// Contraseña inicial de los usuarios creados desde Coordinación (la interfaz no pide una).
const DEFAULT_PASSWORD = process.env.SIGTAU_DEFAULT_PASSWORD || "demo1234";
const SUBJECT_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

const duplicate = (field, message) =>
  new HttpError(409, message, { code: "DUPLICATE", fields: { [field]: message } });

export default function adminRoutes(db, auth) {
  const router = Router();
  const guard = [auth, requireRole("Coordinación")];

  function userFields(b) {
    const v = new Validator();
    const user = {
      name: v.string(b.name, "name", "El nombre", { max: 100 }),
      last: v.string(b.last, "last", "El apellido", { max: 100 }),
      email: v.email(b.email),
      role: v.oneOf(b.role, "role", "El rol", ROLES),
      career: v.optionalString(b.career, "career", "La carrera", { max: 100 }),
    };
    v.done();
    return user;
  }
  const emailTaken = (email, exceptId = 0) =>
    db.prepare("SELECT 1 FROM users WHERE email = ? AND id <> ?").get(email, exceptId);
  const EMAIL_TAKEN = "Ya existe un usuario registrado con este correo.";

  router.post("/users", ...guard, (req, res) => {
    const u = userFields(body(req));
    if (emailTaken(u.email)) throw duplicate("email", EMAIL_TAKEN);
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO users (name, last_name, email, password_hash, role, career) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(u.name, u.last, u.email, hashPassword(DEFAULT_PASSWORD), u.role, u.career);
    res
      .status(201)
      .json(userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(lastInsertRowid)));
  });

  router.put("/users/:id", ...guard, (req, res) => {
    const userId = id(req.params.id, "El usuario");
    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!current) throw notFound("Usuario no encontrado.");
    const u = userFields(body(req));
    if (emailTaken(u.email, userId)) throw duplicate("email", EMAIL_TAKEN);
    if (u.role !== current.role) {
      if (userId === req.user.id) throw conflict("No puedes cambiar tu propio rol.");
      const tied =
        db.prepare("SELECT 1 FROM schedules WHERE tutor_id = ?").get(userId) ||
        db.prepare("SELECT 1 FROM requests WHERE student_id = ?").get(userId);
      if (tied)
        throw conflict("No se puede cambiar el rol: el usuario ya tiene horarios o solicitudes.");
    }
    db.prepare(
      "UPDATE users SET name = ?, last_name = ?, email = ?, role = ?, career = ? WHERE id = ?",
    ).run(u.name, u.last, u.email, u.role, u.career, userId);
    res.json(userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(userId)));
  });

  router.patch("/users/:id/active", ...guard, (req, res) => {
    const userId = id(req.params.id, "El usuario");
    const v = new Validator();
    const active = v.bool(body(req).active, "active", "Indica si el usuario queda activo.");
    v.done();
    if (userId === req.user.id && !active) throw conflict("No puedes desactivar tu propia cuenta.");
    const { changes } = db
      .prepare("UPDATE users SET active = ? WHERE id = ?")
      .run(active ? 1 : 0, userId);
    if (!changes) throw notFound("Usuario no encontrado.");
    res.json(userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(userId)));
  });

  router.post("/subjects", ...guard, (req, res) => {
    const b = body(req);
    const v = new Validator();
    const code = v.string(b.code, "code", "El código", { max: 20 })?.toUpperCase();
    if (code && !SUBJECT_CODE_RE.test(code))
      v.fail("code", "El código solo puede tener letras, números y guiones (2 a 20 caracteres).");
    const name = v.string(b.name, "name", "El nombre", { max: 150 });
    v.done();
    if (db.prepare("SELECT 1 FROM subjects WHERE code = ?").get(code))
      throw duplicate("code", "Ya existe una asignatura con este código.");
    const { lastInsertRowid } = db
      .prepare("INSERT INTO subjects (code, name) VALUES (?, ?)")
      .run(code, name);
    res
      .status(201)
      .json(subjectOut(db.prepare("SELECT * FROM subjects WHERE id = ?").get(lastInsertRowid)));
  });

  return router;
}
