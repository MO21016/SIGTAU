// Script de seeds: carga los datos de demostración (los mismos que estaban quemados en src/App.tsx).
//   npm run db:seed
// Es idempotente: borra el contenido de las tablas y lo vuelve a insertar.
// Las fechas de solicitudes/notificaciones son relativas al día en que se ejecuta,
// igual que en el frontend, para que siempre haya sesiones próximas y pasadas.
import { assertSafeToWipe, hashPassword, openDb } from "./db.mjs";

assertSafeToWipe("db:seed");

const DEMO_PASSWORD = "demo1234";
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ---- helpers de fecha (en hora local) --------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return ymd(d);
};
// Próxima fecha (a partir de mañana) que cae en `day`.
const dateForDay = (day) => {
  const d = new Date();
  let add = (DAYS.indexOf(day) + 1 - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return ymd(d);
};
// Timestamp UTC "YYYY-MM-DD HH:MM:SS" para `daysAgo` días atrás a la hora local h:m.
const stamp = (daysAgo, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

// ---- datos -----------------------------------------------------------------
const subjects = [
  [1, "PRN115", "Programación I"],
  [2, "MAT115", "Matemática I"],
  [3, "FIS115", "Física I"],
  [4, "BDD215", "Bases de Datos"],
  [5, "EST115", "Estadística"],
];

// [id, nombre, apellido, correo, rol, activo, carrera]
const users = [
  [1, "Andrea", "Ramírez", "andrea@ues.edu.sv", "Estudiante", 1, "Ingeniería de Sistemas"],
  [2, "Carlos", "Mejía", "carlos@ues.edu.sv", "Estudiante", 1, "Ingeniería Industrial"],
  [3, "Marta", "Gómez", "marta@ues.edu.sv", "Tutor", 1, null],
  [4, "Luis", "Hernández", "luis@ues.edu.sv", "Tutor", 1, null],
  [5, "Sofía", "Martínez", "sofia@ues.edu.sv", "Tutor", 1, null],
  [6, "Diego", "López", "diego@ues.edu.sv", "Tutor", 1, null],
  [7, "Rosa", "Chávez", "rosa@ues.edu.sv", "Coordinación", 1, null],
  [8, "Mario", "Pérez", "mario@ues.edu.sv", "Estudiante", 0, "Ingeniería Civil"],
];

// [id, tutor_id, subject_id, día, inicio, fin, capacidad]
const schedules = [
  [1, 3, 1, "Lunes", "09:00", "11:00", 4],
  [2, 3, 4, "Miércoles", "14:00", "16:00", 12],
  [3, 4, 2, "Martes", "10:00", "12:00", 8],
  [4, 5, 3, "Jueves", "13:00", "15:00", 10],
  [5, 6, 5, "Viernes", "08:00", "10:00", 6],
  [6, 4, 1, "Sábado", "09:00", "11:00", 15],
];

// [id, student_id, schedule_id, fecha, temas, estado, asistencia, comprensión, observaciones, archivos]
const requests = [
  [
    1,
    1,
    1,
    dateForDay("Lunes"),
    "Necesito reforzar ciclos, arreglos y resolución de ejercicios prácticos.",
    "Pendiente",
    null,
    null,
    null,
    ["guia-ejercicios.pdf"],
  ],
  [
    2,
    1,
    3,
    dateForDay("Martes"),
    "Repaso de límites y continuidad para el examen parcial.",
    "Aprobada",
    null,
    null,
    null,
    [],
  ],
  [
    3,
    1,
    4,
    iso(-12),
    "Movimiento rectilíneo y leyes de Newton.",
    "Realizada",
    1,
    "Alto",
    "Resolvió correctamente los ejercicios y mostró buen dominio.",
    [],
  ],
  [
    4,
    2,
    1,
    dateForDay("Lunes"),
    "Funciones y estructuras de control.",
    "Aprobada",
    null,
    null,
    null,
    [],
  ],
  [
    5,
    2,
    1,
    dateForDay("Lunes"),
    "Preparación de evaluación práctica.",
    "Aprobada",
    null,
    null,
    null,
    [],
  ],
  [6, 2, 1, dateForDay("Lunes"), "Ejercicios de arreglos.", "Aprobada", null, null, null, []],
  [7, 2, 1, dateForDay("Lunes"), "Repaso general.", "Aprobada", null, null, null, []],
  [8, 2, 2, iso(-7), "Normalización de bases de datos.", "Rechazada", null, null, null, []],
  [
    9,
    2,
    5,
    iso(-5),
    "Distribuciones de probabilidad.",
    "Realizada",
    0,
    "Bajo",
    "El estudiante no asistió.",
    [],
  ],
  [10, 1, 5, iso(-3), "Intervalos de confianza.", "Cancelada", null, null, null, []],
  [11, 2, 3, iso(-2), "Derivadas y aplicaciones.", "Aprobada", null, null, null, []],
];

// [id, user_id, texto, destino, leída, creada]
const notifications = [
  [1, 1, "Tu solicitud de Matemática I fue aprobada.", "requests", 0, stamp(0, 8, 35)],
  [
    2,
    1,
    "Ya puedes consultar el resultado de tu tutoría de Física I.",
    "requests",
    0,
    stamp(1, 15, 10),
  ],
  [3, 3, "Andrea Ramírez envió una nueva solicitud.", "received", 0, stamp(0, 9, 20)],
  [4, 7, "Hay 4 horarios activos para revisión de cupos.", "subjects", 1, stamp(6, 10, 0)],
];

// ---- carga -----------------------------------------------------------------
const db = openDb();

const load = db.transaction(() => {
  // Orden inverso a las dependencias; reinicia también los autoincrementos.
  for (const t of ["notifications", "request_files", "requests", "schedules", "subjects", "users"])
    db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence");

  const insSubject = db.prepare("INSERT INTO subjects (id, code, name) VALUES (?, ?, ?)");
  subjects.forEach((s) => insSubject.run(...s));

  const insUser = db.prepare(
    "INSERT INTO users (id, name, last_name, email, password_hash, role, active, career) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  users.forEach(([id, name, last, email, role, active, career]) =>
    insUser.run(id, name, last, email, hashPassword(DEMO_PASSWORD), role, active, career),
  );

  const insSchedule = db.prepare(
    "INSERT INTO schedules (id, tutor_id, subject_id, day, start_time, end_time, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  schedules.forEach((s) => insSchedule.run(...s));

  const insRequest = db.prepare(
    `INSERT INTO requests (id, student_id, schedule_id, session_date, topics, status, attendance, comprehension, observations, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Mismo created_at para todas: las solicitudes nuevas quedan por encima y el orden inicial se conserva.
  const seededAt = stamp(0, 0, 0);
  const insFile = db.prepare("INSERT INTO request_files (request_id, file_name) VALUES (?, ?)");
  requests.forEach(([id, ...rest]) => {
    const files = rest.pop();
    insRequest.run(id, ...rest, seededAt);
    files.forEach((f) => insFile.run(id, f));
  });

  const insNotice = db.prepare(
    "INSERT INTO notifications (id, user_id, text, target, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  notifications.forEach((n) => insNotice.run(...n));
});

load();

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log("✔ Datos de demostración cargados");
for (const t of ["users", "subjects", "schedules", "requests", "request_files", "notifications"])
  console.log(`  ${t.padEnd(14)} ${count(t)}`);
console.log(`\n  Cuentas de prueba (contraseña: ${DEMO_PASSWORD})`);
console.log("    Estudiante    andrea@ues.edu.sv");
console.log("    Tutor         marta@ues.edu.sv");
console.log("    Coordinación  rosa@ues.edu.sv");
db.close();
