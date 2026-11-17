// Convierte filas de la BD (snake_case) a la forma que usa el frontend (camelCase).
export const userOut = (u, { withEmail = true } = {}) => ({
  id: u.id,
  name: u.name,
  last: u.last_name,
  email: withEmail ? u.email : "",
  role: u.role,
  active: !!u.active,
  ...(u.career ? { career: u.career } : {}),
});

export const subjectOut = (s) => ({ id: s.id, code: s.code, name: s.name });

export const scheduleOut = (s) => ({
  id: s.id,
  tutorId: s.tutor_id,
  subjectId: s.subject_id,
  day: s.day,
  start: s.start_time,
  end: s.end_time,
  capacity: s.capacity,
  approved: s.approved ?? 0, // total de solicitudes aprobadas (para calcular cupos)
});

export const requestOut = (r, files = []) => ({
  id: r.id,
  studentId: r.student_id,
  scheduleId: r.schedule_id,
  date: r.session_date,
  topics: r.topics,
  files,
  status: r.status,
  ...(r.attendance !== null ? { attendance: !!r.attendance } : {}),
  ...(r.comprehension ? { comprehension: r.comprehension } : {}),
  ...(r.observations ? { observations: r.observations } : {}),
});

// "Hoy, 8:35 a. m." / "Ayer, 3:10 p. m." / "12 de mayo", como mostraba el frontend.
export function noticeDate(sqlUtc) {
  const d = new Date(`${sqlUtc.replace(" ", "T")}Z`);
  const now = new Date();
  if (now - d < 60_000) return "Ahora";
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diff === 0) return `Hoy, ${time}`;
  if (diff === 1) return `Ayer, ${time}`;
  return d.toLocaleDateString("es-SV", { day: "numeric", month: "long" });
}

export const noticeOut = (n) => ({
  id: n.id,
  userId: n.user_id,
  text: n.text,
  target: n.target,
  read: !!n.is_read,
  date: noticeDate(n.created_at),
});
