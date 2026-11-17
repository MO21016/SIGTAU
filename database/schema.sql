-- ============================================================================
-- SIGTAU · Esquema de base de datos (SQLite)
-- Se ejecuta con:  npm run db:create
-- ============================================================================
-- Los nombres de columnas están en snake_case; el frontend usa camelCase
-- (last_name -> last, tutor_id -> tutorId, ...). La conversión se hará en la API.

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Usuarios (Estudiante | Tutor | Coordinación)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  last_name     TEXT    NOT NULL CHECK (length(trim(last_name)) > 0),
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE
                        CHECK (email LIKE '%_@ues.edu.sv'),
  password_hash TEXT    NOT NULL,           -- scrypt$<salt>$<hash>, ver database/db.mjs
  role          TEXT    NOT NULL CHECK (role IN ('Estudiante', 'Tutor', 'Coordinación')),
  career        TEXT,                       -- solo aplica a estudiantes
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Asignaturas
-- ----------------------------------------------------------------------------
CREATE TABLE subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(code)) > 0),
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Horarios de tutoría (disponibilidad semanal de un tutor para una asignatura)
-- ----------------------------------------------------------------------------
CREATE TABLE schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_id   INTEGER NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  day        TEXT    NOT NULL CHECK (day IN ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')),
  start_time TEXT    NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),  -- HH:MM
  end_time   TEXT    NOT NULL CHECK (end_time   GLOB '[0-2][0-9]:[0-5][0-9]'),
  capacity   INTEGER NOT NULL DEFAULT 10 CHECK (capacity >= 1),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (end_time > start_time),
  UNIQUE (tutor_id, day, start_time)
);

-- ----------------------------------------------------------------------------
-- Solicitudes de tutoría (y, cuando status = 'Realizada', su resultado)
-- ----------------------------------------------------------------------------
CREATE TABLE requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  schedule_id   INTEGER NOT NULL REFERENCES schedules(id) ON DELETE RESTRICT,
  session_date  TEXT    NOT NULL CHECK (date(session_date) = session_date),  -- YYYY-MM-DD
  topics        TEXT    NOT NULL CHECK (length(trim(topics)) > 0 AND length(topics) <= 1000),
  status        TEXT    NOT NULL DEFAULT 'Pendiente'
                        CHECK (status IN ('Pendiente','Aprobada','Rechazada','Cancelada','Realizada')),
  -- Resultado de la sesión (solo cuando status = 'Realizada')
  attendance    INTEGER CHECK (attendance IN (0, 1)),
  comprehension TEXT    CHECK (comprehension IN ('Bajo', 'Medio', 'Alto')),
  observations  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (status = 'Realizada' AND attendance IS NOT NULL AND comprehension IS NOT NULL)
    OR
    (status <> 'Realizada' AND attendance IS NULL AND comprehension IS NULL AND observations IS NULL)
  )
);

-- Material de apoyo adjunto a una solicitud (hasta 3 por solicitud en la UI)
CREATE TABLE request_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  file_name  TEXT    NOT NULL CHECK (length(trim(file_name)) > 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, file_name)
);

-- ----------------------------------------------------------------------------
-- Notificaciones
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL CHECK (length(trim(text)) > 0),
  target     TEXT    NOT NULL,        -- página del frontend a la que lleva (requests, received, ...)
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
CREATE INDEX idx_users_role            ON users(role);
CREATE INDEX idx_schedules_tutor       ON schedules(tutor_id);
CREATE INDEX idx_schedules_subject     ON schedules(subject_id);
CREATE INDEX idx_requests_student      ON requests(student_id);
CREATE INDEX idx_requests_schedule     ON requests(schedule_id, session_date, status);
CREATE INDEX idx_requests_status       ON requests(status);
CREATE INDEX idx_request_files_request ON request_files(request_id);
CREATE INDEX idx_notifications_user    ON notifications(user_id, is_read);

-- ----------------------------------------------------------------------------
-- Integridad por rol (SQLite no permite CHECK con subconsultas)
-- ----------------------------------------------------------------------------
CREATE TRIGGER schedules_tutor_role_insert
BEFORE INSERT ON schedules
WHEN (SELECT role FROM users WHERE id = NEW.tutor_id) IS NOT 'Tutor'
BEGIN
  SELECT RAISE(ABORT, 'El usuario asignado al horario debe tener rol Tutor');
END;

CREATE TRIGGER schedules_tutor_role_update
BEFORE UPDATE OF tutor_id ON schedules
WHEN (SELECT role FROM users WHERE id = NEW.tutor_id) IS NOT 'Tutor'
BEGIN
  SELECT RAISE(ABORT, 'El usuario asignado al horario debe tener rol Tutor');
END;

CREATE TRIGGER requests_student_role_insert
BEFORE INSERT ON requests
WHEN (SELECT role FROM users WHERE id = NEW.student_id) IS NOT 'Estudiante'
BEGIN
  SELECT RAISE(ABORT, 'La solicitud debe pertenecer a un usuario con rol Estudiante');
END;

CREATE TRIGGER requests_student_role_update
BEFORE UPDATE OF student_id ON requests
WHEN (SELECT role FROM users WHERE id = NEW.student_id) IS NOT 'Estudiante'
BEGIN
  SELECT RAISE(ABORT, 'La solicitud debe pertenecer a un usuario con rol Estudiante');
END;

-- Mantener updated_at al día
CREATE TRIGGER users_touch
AFTER UPDATE ON users
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER requests_touch
AFTER UPDATE ON requests
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE requests SET updated_at = datetime('now') WHERE id = NEW.id;
END;
