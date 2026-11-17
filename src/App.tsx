import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, errorMessage, setUnauthorizedHandler } from "./api";

export type Role = "Estudiante" | "Tutor" | "Coordinación";
export type Status = "Pendiente" | "Aprobada" | "Rechazada" | "Cancelada" | "Realizada";
export type User = {
  id: number;
  name: string;
  last: string;
  email: string;
  role: Role;
  active: boolean;
  career?: string;
};
export type Subject = { id: number; code: string; name: string };
export type Schedule = {
  id: number;
  tutorId: number;
  subjectId: number;
  day: string;
  start: string;
  end: string;
  capacity: number;
  approved?: number; // total de solicitudes aprobadas, calculado por la API
};
export type Request = {
  id: number;
  studentId: number;
  scheduleId: number;
  date: string;
  topics: string;
  files: string[];
  status: Status;
  attendance?: boolean;
  comprehension?: "Bajo" | "Medio" | "Alto";
  observations?: string;
};
export type Notice = {
  id: number;
  userId: number;
  text: string;
  target: string;
  read: boolean;
  date: string;
};

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Fechas en hora local (toISOString usa UTC y de noche daría el día siguiente).
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDate(d);
};
const dateForDay = (day: string, weeks = 1) => {
  const idx = days.indexOf(day) + 1;
  const d = new Date();
  let add = (idx - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add + (weeks - 1) * 7);
  return localDate(d);
};
const navByRole: Record<Role, [string, string][]> = {
  Estudiante: [
    ["dashboard", "Resumen"],
    ["available", "Tutorías disponibles"],
    ["requests", "Mis solicitudes"],
  ],
  Tutor: [
    ["dashboard", "Resumen"],
    ["availability", "Mi disponibilidad"],
    ["received", "Solicitudes recibidas"],
    ["results", "Registrar resultados"],
  ],
  Coordinación: [
    ["dashboard", "Resumen"],
    ["users", "Gestión de usuarios"],
    ["subjects", "Asignaturas y cupos"],
    ["reports", "Reportes y estadísticas"],
  ],
};
const dayIndex = (d: string) => days.indexOf(d) + 1;
const fmtDate = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("es-SV", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const cls = (...x: (string | false | undefined)[]) => x.filter(Boolean).join(" ");

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    calendar: (
      <>
        <path d="M5 3v3M19 3v3M3 9h18M4 5h16v16H4z" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
        <path d="M4 5.5v14" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m4 16-1 5 5-1L19 9l-4-4zM13 7l4 4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 11v6M14 11v6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7v6M12 17h.01" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name] || paths.file}
    </svg>
  );
}

function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [current, setCurrent] = useState<User | null>(null);
  const [page, setPage] = useState("dashboard");
  const [selectedSchedule, setSelectedSchedule] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const flashTimer = useRef<number>(0);
  const [menu, setMenu] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Si un dato referenciado no está disponible se muestra un texto neutro en vez de romper la pantalla.
  const subject = (id: number): Subject =>
    subjects.find((x) => x.id === id) ?? { id, code: "—", name: "Asignatura no disponible" };
  const user = (id: number): User =>
    users.find((x) => x.id === id) ?? {
      id,
      name: "Usuario",
      last: "no disponible",
      email: "",
      role: "Estudiante",
      active: false,
    };
  // Con fecha: se cuenta sobre las solicitudes visibles (el tutor ve todas las de sus horarios).
  // Sin fecha: usa el total que calcula la API (el estudiante solo ve sus propias solicitudes).
  const approvedCount = (scheduleId: number, date?: string) =>
    date
      ? requests.filter(
          (r) => r.scheduleId === scheduleId && r.status === "Aprobada" && r.date === date,
        ).length
      : (schedules.find((s) => s.id === scheduleId)?.approved ?? 0);
  const go = (p: string) => {
    setPage(p);
    setMenu(false);
  };
  const showFlash = (text: string, kind: "success" | "error" = "success") => {
    window.clearTimeout(flashTimer.current); // un aviso viejo no debe borrar el nuevo
    setFlash({ text, kind });
    flashTimer.current = window.setTimeout(() => setFlash(null), kind === "error" ? 7000 : 4500);
  };

  const apply = (d: Awaited<ReturnType<typeof api.bootstrap>>) => {
    setCurrent(d.me);
    setUsers(d.users);
    setSubjects(d.subjects);
    setSchedules(d.schedules);
    setRequests(d.requests);
    setNotices(d.notices);
  };
  const reload = async () => apply(await api.bootstrap());
  // Ejecuta una acción contra la API, refresca los datos y avisa el resultado.
  // Devuelve true si salió bien (para que el formulario sepa si debe cerrarse o limpiarse).
  // `onError` permite al formulario mostrar el error en línea; si devuelve true, no se muestra el aviso.
  // Mientras hay una acción en curso se ignoran las nuevas (evita dobles envíos).
  const act = async (
    fn: () => Promise<unknown>,
    okMessage?: string,
    onError?: (e: ApiError) => boolean | void,
  ) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof ApiError && onError?.(e))) showFlash(errorMessage(e), "error");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    // La acción ya se guardó; si falla solo la recarga, se avisa sin tratarla como fallida.
    try {
      await reload();
      if (okMessage) showFlash(okMessage);
    } catch {
      showFlash(
        "El cambio se guardó, pero no se pudieron actualizar los datos. Recarga la página.",
        "error",
      );
    }
    return true;
  };

  const clearSession = () => {
    api.logout();
    setCurrent(null);
    setPage("dashboard");
    setSelectedSchedule(null);
    setUsers([]);
    setSubjects([]);
    setSchedules([]);
    setRequests([]);
    setNotices([]);
  };
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setLoginError("Tu sesión expiró. Inicia sesión de nuevo.");
    });
  }, []);

  async function signIn(email: string, password: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api.login(email, password);
      apply(await api.bootstrap());
      setPage("dashboard");
      setLoginError("");
    } catch (e) {
      api.logout();
      setLoginError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    signIn(String(fd.get("email")), String(fd.get("password")));
  }
  const logout = clearSession;
  if (!current)
    return (
      <Login
        onSubmit={login}
        error={loginError}
        busy={busy}
        fill={(email) => signIn(email, "demo1234")}
      />
    );
  const unread = notices.filter((n) => n.userId === current.id && !n.read).length;
  const props = {
    current,
    users,
    subjects,
    schedules,
    requests,
    notices,
    subject,
    user,
    approvedCount,
    act,
    busy,
    go,
    showFlash,
  };

  let content: ReactNode;
  if (page === "dashboard") content = <Dashboard {...props} />;
  else if (page === "notifications") content = <Notifications {...props} />;
  else if (page === "available")
    content = selectedSchedule ? (
      <RequestForm
        {...props}
        scheduleId={selectedSchedule}
        close={() => {
          setSelectedSchedule(null);
          go("requests");
        }}
      />
    ) : (
      <Available {...props} select={setSelectedSchedule} />
    );
  else if (page === "requests") content = <MyRequests {...props} />;
  else if (page === "availability") content = <Availability {...props} />;
  else if (page === "received") content = <Received {...props} />;
  else if (page === "results") content = <Results {...props} />;
  else if (page === "users") content = <Users {...props} />;
  else if (page === "subjects") content = <Subjects {...props} />;
  else content = <Reports {...props} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenu(!menu)} aria-label="Abrir menú">
          <Icon name={menu ? "close" : "menu"} />
        </button>
        <button className="brand" onClick={() => go("dashboard")}>
          SIGTAU <span>Universidad de El Salvador</span>
        </button>
        <div className="top-actions">
          <button
            className="bell"
            onClick={() => go("notifications")}
            aria-label={`Notificaciones, ${unread} sin leer`}
          >
            <Icon name="bell" />
            {unread > 0 && <b>{unread}</b>}
          </button>
          <div className="user-chip">
            <span>
              {current.name[0]}
              {current.last[0]}
            </span>
            <div>
              <strong>
                {current.name} {current.last}
              </strong>
              <small>{current.role}</small>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <Icon name="logout" size={18} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>
      <aside className={cls("sidebar", menu && "open")}>
        <p className="nav-label">MENÚ PRINCIPAL</p>
        <nav>
          {navByRole[current.role].map(([key, label]) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => go(key)}>
              <Icon
                name={
                  key === "dashboard"
                    ? "home"
                    : key === "users" || key === "received"
                      ? "users"
                      : key === "reports"
                        ? "chart"
                        : key === "subjects"
                          ? "book"
                          : "calendar"
                }
              />
              {label}
            </button>
          ))}
          <button
            className={page === "notifications" ? "active" : ""}
            onClick={() => go("notifications")}
          >
            <Icon name="bell" />
            Notificaciones{unread > 0 && <em>{unread}</em>}
          </button>
        </nav>
        <div className="sidebar-help">
          <strong>¿Necesitas ayuda?</strong>
          <p>Contacta a Coordinación Académica.</p>
          <a href="mailto:coordinacion@ues.edu.sv">Escribir un correo</a>
        </div>
      </aside>
      {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="Cerrar menú" />}
      <main className="main">
        {flash && (
          <div
            className={cls("success", flash.kind === "error" && "error")}
            role={flash.kind === "error" ? "alert" : "status"}
          >
            <Icon name={flash.kind === "error" ? "alert" : "check"} />
            {flash.text}
          </div>
        )}
        {content}
      </main>
    </div>
  );
}

type P = any;
function Login({
  onSubmit,
  error,
  busy,
  fill,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  error: string;
  busy: boolean;
  fill: (email: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <main className="login">
      <section className="login-brand">
        <div className="seal">UES</div>
        <div>
          <p>SISTEMA ACADÉMICO</p>
          <h1>SIGTAU</h1>
          <h2>Sistema de Gestión de Tutorías Académicas Universitarias</h2>
          <span>Universidad de El Salvador</span>
        </div>
        <small>Excelencia académica, acompañamiento integral.</small>
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="mobile-logo">
            SIGTAU <span>UES</span>
          </div>
          <p className="eyebrow">BIENVENIDO</p>
          <h2>Inicia sesión</h2>
          <p className="muted">Ingresa con tus credenciales institucionales.</p>
          {error && (
            <div className="error-banner">
              <Icon name="alert" />
              {error}
            </div>
          )}
          <form onSubmit={onSubmit}>
            <label>
              Correo institucional
              <input
                name="email"
                type="email"
                placeholder="carnet@ues.edu.sv"
                pattern="[^@ ]+@ues\.edu\.sv"
                maxLength={150}
                required
              />
            </label>
            <label>
              Contraseña
              <div className="password">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  placeholder="Ingresa tu contraseña"
                  maxLength={200}
                  required
                />
                <button type="button" onClick={() => setShow(!show)}>
                  {show ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>
            <button className="primary wide" type="submit" disabled={busy}>
              Ingresar al sistema <Icon name="arrow" />
            </button>
          </form>
          <div className="demo">
            <strong>Cuentas de demostración</strong>
            <p>
              Contraseña para todas: <b>demo1234</b>
            </p>
            {[
              ["andrea@ues.edu.sv", "Estudiante"],
              ["marta@ues.edu.sv", "Tutor"],
              ["rosa@ues.edu.sv", "Coordinación"],
            ].map((x) => (
              <button key={x[0]} onClick={() => fill(x[0])}>
                <span>{x[1]}</span>
                {x[0]}
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
          <p className="login-note">
            El acceso está reservado a usuarios autorizados. No hay registro público.
          </p>
        </div>
      </section>
    </main>
  );
}

function PageHead({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="file" size={30} />
      <p>{text}</p>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
}) {
  return (
    <article className="stat">
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function Dashboard(p: P) {
  const { current, requests, schedules, subject, user, go, notices } = p;
  const mine =
    current.role === "Estudiante"
      ? requests.filter((r: Request) => r.studentId === current.id)
      : current.role === "Tutor"
        ? requests.filter(
            (r: Request) =>
              schedules.find((s: Schedule) => s.id === r.scheduleId)?.tutorId === current.id,
          )
        : requests;
  const stats =
    current.role === "Estudiante"
      ? [
          [
            "Solicitudes activas",
            mine.filter((r: Request) => ["Pendiente", "Aprobada"].includes(r.status)).length,
            "Pendientes o aprobadas",
            "file",
          ],
          [
            "Tutorías realizadas",
            mine.filter((r: Request) => r.status === "Realizada").length,
            "En tu historial",
            "check",
          ],
          ["Horarios disponibles", schedules.length, "En 5 asignaturas", "calendar"],
        ]
      : current.role === "Tutor"
        ? [
            [
              "Solicitudes pendientes",
              mine.filter((r: Request) => r.status === "Pendiente").length,
              "Requieren atención",
              "file",
            ],
            [
              "Sesiones aprobadas",
              mine.filter((r: Request) => r.status === "Aprobada").length,
              "Próximas y pasadas",
              "calendar",
            ],
            [
              "Tutorías realizadas",
              mine.filter((r: Request) => r.status === "Realizada").length,
              "Este período",
              "check",
            ],
          ]
        : [
            [
              "Usuarios activos",
              p.users.filter((u: User) => u.active).length,
              "En la plataforma",
              "users",
            ],
            ["Solicitudes recibidas", requests.length, "Total acumulado", "file"],
            [
              "Tutorías realizadas",
              requests.filter((r: Request) => r.status === "Realizada").length,
              "Total acumulado",
              "check",
            ],
          ];
  const recent = mine.slice(0, 4);
  return (
    <>
      <PageHead
        eyebrow="PANEL PRINCIPAL"
        title={`Hola, ${current.name}`}
        text="Consulta el estado de la actividad académica y accede rápidamente a tus tareas."
      />
      <section className="stats">
        {stats.map((x: any) => (
          <Stat key={x[0]} label={x[0]} value={x[1]} detail={x[2]} icon={x[3]} />
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Actividad reciente</h2>
              <p>Últimos movimientos del sistema</p>
            </div>
          </div>
          {recent.length ? (
            <div className="activity">
              {recent.map((r: Request) => {
                const s = schedules.find((x: Schedule) => x.id === r.scheduleId);
                return (
                  <button
                    key={r.id}
                    onClick={() =>
                      go(
                        current.role === "Tutor"
                          ? "received"
                          : current.role === "Estudiante"
                            ? "requests"
                            : "reports",
                      )
                    }
                  >
                    <span className="activity-icon">
                      <Icon name="book" />
                    </span>
                    <div>
                      <strong>{subject(s.subjectId).name}</strong>
                      <small>
                        {current.role === "Estudiante"
                          ? `Con ${user(s.tutorId).name} ${user(s.tutorId).last}`
                          : fmtDate(r.date)}
                      </small>
                    </div>
                    <Badge status={r.status} />
                    <Icon name="arrow" size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty text="No hay actividad reciente." />
          )}
        </section>
        <section className="card quick">
          <div className="card-head">
            <div>
              <h2>Accesos rápidos</h2>
              <p>Continúa con tus gestiones</p>
            </div>
          </div>
          {navByRole[current.role as Role].slice(1).map(([key, label]) => (
            <button key={key} onClick={() => go(key)}>
              <Icon name={key === "users" ? "users" : key === "reports" ? "chart" : "calendar"} />
              <span>
                <strong>{label}</strong>
                <small>Ir a esta sección</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
          <div className="notice-summary">
            <Icon name="bell" />
            <span>
              <strong>
                {notices.filter((n: Notice) => n.userId === current.id && !n.read).length}{" "}
                notificaciones sin leer
              </strong>
              <button onClick={() => go("notifications")}>Ver todas</button>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function Notifications(p: P) {
  const [tab, setTab] = useState("Todas");
  const mine = p.notices.filter(
    (n: Notice) => n.userId === p.current.id && (tab === "Todas" || !n.read),
  );
  const open = (n: Notice) => {
    if (!n.read) p.act(() => api.markNoticeRead(n.id));
    p.go(n.target);
  };
  return (
    <>
      <PageHead
        eyebrow="CENTRO DE AVISOS"
        title="Notificaciones"
        text="Mantente al día con tus solicitudes y actividades."
        action={
          <button className="secondary" onClick={() => p.act(() => api.markAllNoticesRead())}>
            <Icon name="check" />
            Marcar todas como leídas
          </button>
        }
      />
      <section className="card">
        <div className="tabs">
          <button className={tab === "Todas" ? "active" : ""} onClick={() => setTab("Todas")}>
            Todas
          </button>
          <button className={tab === "Sin leer" ? "active" : ""} onClick={() => setTab("Sin leer")}>
            Sin leer
          </button>
        </div>
        {mine.length ? (
          <div className="notices">
            {mine.map((n: Notice) => (
              <button key={n.id} className={!n.read ? "unread" : ""} onClick={() => open(n)}>
                <span className="notice-icon">
                  <Icon name="bell" />
                </span>
                <div>
                  <strong>{n.text}</strong>
                  <small>{n.date}</small>
                </div>
                {!n.read && <i />}
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        ) : (
          <Empty text="No hay notificaciones en esta vista." />
        )}
      </section>
    </>
  );
}

function Available(p: P & { select: (id: number) => void }) {
  const [filters, setFilters] = useState({ subject: "", day: "", tutor: "" });
  const list = p.schedules.filter(
    (s: Schedule) =>
      (!filters.subject || s.subjectId === +filters.subject) &&
      (!filters.day || s.day === filters.day) &&
      (!filters.tutor || s.tutorId === +filters.tutor),
  );
  return (
    <>
      <PageHead
        eyebrow="OFERTA ACADÉMICA"
        title="Tutorías disponibles"
        text="Encuentra el horario que mejor se adapte a tus necesidades."
      />
      <section className="card filters">
        <div className="filter-grid">
          <label>
            Asignatura
            <select
              value={filters.subject}
              onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
            >
              <option value="">Todas las asignaturas</option>
              {p.subjects.map((s: Subject) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Día
            <select
              value={filters.day}
              onChange={(e) => setFilters({ ...filters, day: e.target.value })}
            >
              <option value="">Todos los días</option>
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Tutor
            <select
              value={filters.tutor}
              onChange={(e) => setFilters({ ...filters, tutor: e.target.value })}
            >
              <option value="">Todos los tutores</option>
              {p.users
                .filter((u: User) => u.role === "Tutor")
                .map((u: User) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.last}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => setFilters({ subject: "", day: "", tutor: "" })}
          >
            Limpiar filtros
          </button>
        </div>
      </section>
      <section className="card table-card">
        <div className="table-title">
          <h2>{list.length} horarios encontrados</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asignatura</th>
                <th>Tutor</th>
                <th>Día y horario</th>
                <th>Capacidad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s: Schedule) => {
                const count = p.approvedCount(s.id);
                const full = count >= s.capacity;
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{p.subject(s.subjectId).name}</strong>
                      <small>{p.subject(s.subjectId).code}</small>
                    </td>
                    <td>
                      {p.user(s.tutorId).name} {p.user(s.tutorId).last}
                    </td>
                    <td>
                      <strong>{s.day}</strong>
                      <small>
                        {s.start} – {s.end}
                      </small>
                    </td>
                    <td>
                      <div className="capacity-label">
                        <span>
                          {count} de {s.capacity} ocupados
                        </span>
                        <b>{Math.max(s.capacity - count, 0)} libres</b>
                      </div>
                      <div className="progress">
                        <i style={{ width: `${Math.min((count / s.capacity) * 100, 100)}%` }} />
                      </div>
                    </td>
                    <td>
                      <button
                        className="primary small"
                        disabled={full}
                        onClick={() => p.select(s.id)}
                      >
                        {full ? "Sin cupos" : "Solicitar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty text="No encontramos horarios con esos filtros." />}
      </section>
    </>
  );
}

function RequestForm(p: P & { scheduleId: number; close: () => void }) {
  const s = p.schedules.find((x: Schedule) => x.id === p.scheduleId);
  const validNext = dateForDay(s.day);
  const [date, setDate] = useState(validNext);
  const [topics, setTopics] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const chosen = new Date(`${date}T12:00:00`);
    if (!date || date <= iso(0) || chosen.getDay() !== dayIndex(s.day))
      er.date = `Selecciona una fecha futura que sea ${s.day.toLowerCase()}. Próxima fecha válida: ${fmtDate(validNext)}.`;
    if (topics.trim().length < 20 || topics.length > 1000)
      er.topics = "Escribe entre 20 y 1000 caracteres.";
    if (files.length > 3) er.files = "Puedes adjuntar un máximo de 3 archivos.";
    if (files.some((f) => !/\.(pdf|docx|png|jpe?g)$/i.test(f.name)))
      er.files = "Los archivos deben ser PDF, DOCX, PNG o JPG.";
    if (files.some((f) => f.size > 5 * 1024 * 1024))
      er.files = "Cada archivo debe pesar menos de 5 MB.";
    if (Object.keys(er).length) return setErrors(er);
    const ok = await p.act(
      () =>
        api.createRequest({
          scheduleId: s.id,
          date,
          topics: topics.trim(),
          files: files.map((f) => f.name),
        }),
      "Solicitud enviada correctamente. El tutor recibirá una notificación.",
      // Errores de validación del servidor: se muestran junto a cada campo.
      (e: ApiError) => {
        if (!e.fields) return false;
        setErrors(e.fields);
        return true;
      },
    );
    if (ok) p.close();
  };
  return (
    <>
      <PageHead
        eyebrow="NUEVA SOLICITUD"
        title="Solicitar tutoría"
        text="Completa la información para enviar tu solicitud al tutor."
      />
      <div className="form-layout">
        <aside className="card summary-card">
          <p className="eyebrow">HORARIO SELECCIONADO</p>
          <h2>{p.subject(s.subjectId).name}</h2>
          <span>{p.subject(s.subjectId).code}</span>
          <hr />
          <dl>
            <div>
              <dt>Tutor</dt>
              <dd>
                {p.user(s.tutorId).name} {p.user(s.tutorId).last}
              </dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd>
                {s.day}, {s.start} – {s.end}
              </dd>
            </div>
            <div>
              <dt>Cupos disponibles</dt>
              <dd className="spots">
                {s.capacity - p.approvedCount(s.id)} de {s.capacity}
              </dd>
            </div>
          </dl>
          <button className="text-button" onClick={() => p.close()}>
            Cambiar horario
          </button>
        </aside>
        <form className="card request-form" onSubmit={submit}>
          <h2>Detalles de la tutoría</h2>
          <label>
            Fecha de la sesión <span>*</span>
            <input
              type="date"
              min={iso(1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={errors.date ? "invalid" : ""}
            />
            {errors.date && (
              <small className="field-error">
                <Icon name="alert" size={15} />
                {errors.date}
              </small>
            )}
            <small>El horario seleccionado corresponde a los días {s.day.toLowerCase()}.</small>
          </label>
          <label>
            Temas que necesitas reforzar <span>*</span>
            <textarea
              rows={6}
              value={topics}
              maxLength={1000}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="Describe con detalle los temas, ejercicios o dudas..."
              className={errors.topics ? "invalid" : ""}
            />
            <span className="counter">{topics.length} / 1000</span>
            {errors.topics && (
              <small className="field-error">
                <Icon name="alert" size={15} />
                {errors.topics}
              </small>
            )}
            <small>Mínimo 20 caracteres.</small>
          </label>
          <label>
            Material de apoyo <small>(opcional)</small>
            <div className="upload">
              <Icon name="file" />
              <strong>Seleccionar archivos</strong>
              <span>PDF, DOCX, PNG o JPG · Máx. 5 MB · Hasta 3 archivos</span>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </div>
            {files.map((f) => (
              <span className="file-pill" key={f.name}>
                {f.name}
              </span>
            ))}
            {errors.files && (
              <small className="field-error">
                <Icon name="alert" size={15} />
                {errors.files}
              </small>
            )}
          </label>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => p.close()}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={p.busy}>
              Enviar solicitud <Icon name="arrow" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function MyRequests(p: P) {
  const mine = p.requests.filter((r: Request) => r.studentId === p.current.id);
  const active = mine.filter((r: Request) => r.status !== "Realizada");
  const history = mine.filter((r: Request) => r.status === "Realizada");
  const cancel = (r: Request) =>
    p.act(() => api.cancelRequest(r.id), "La solicitud fue cancelada y el cupo quedó disponible.");
  return (
    <>
      <PageHead
        eyebrow="SEGUIMIENTO"
        title="Mis solicitudes e historial"
        text="Consulta el estado y los resultados de tus tutorías."
        action={
          <button className="primary" onClick={() => p.go("available")}>
            <Icon name="plus" />
            Nueva solicitud
          </button>
        }
      />
      <section className="card table-card">
        <div className="table-title">
          <h2>Solicitudes</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asignatura</th>
                <th>Fecha</th>
                <th>Tutor</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((r: Request) => {
                const s = p.schedules.find((x: Schedule) => x.id === r.scheduleId);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{p.subject(s.subjectId).name}</strong>
                      <small>{p.subject(s.subjectId).code}</small>
                    </td>
                    <td>
                      {fmtDate(r.date)}
                      <small>
                        {s.start} – {s.end}
                      </small>
                    </td>
                    <td>
                      {p.user(s.tutorId).name} {p.user(s.tutorId).last}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {["Pendiente", "Aprobada"].includes(r.status) && (
                        <button className="danger-link" onClick={() => cancel(r)}>
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!active.length && <Empty text="No tienes solicitudes activas." />}
      </section>
      <h2 className="section-title">Historial de tutorías</h2>
      <div className="history-grid">
        {history.map((r: Request) => {
          const s = p.schedules.find((x: Schedule) => x.id === r.scheduleId);
          return (
            <article className="card history" key={r.id}>
              <div>
                <span className="subject-code">{p.subject(s.subjectId).code}</span>
                <Badge status={r.status} />
              </div>
              <h3>{p.subject(s.subjectId).name}</h3>
              <p>
                {fmtDate(r.date)} · {p.user(s.tutorId).name} {p.user(s.tutorId).last}
              </p>
              <hr />
              <dl>
                <div>
                  <dt>Asistencia</dt>
                  <dd className={r.attendance ? "green" : "red"}>
                    {r.attendance ? "Sí asistió" : "No asistió"}
                  </dd>
                </div>
                <div>
                  <dt>Comprensión</dt>
                  <dd>{r.comprehension}</dd>
                </div>
              </dl>
              <blockquote>{r.observations}</blockquote>
            </article>
          );
        })}
        {!history.length && <Empty text="Aún no tienes tutorías realizadas." />}
      </div>
    </>
  );
}

function Availability(p: P) {
  const mine = p.schedules.filter((s: Schedule) => s.tutorId === p.current.id);
  const blank = { subjectId: "1", day: "Lunes", start: "08:00", end: "09:00" };
  const [form, setForm] = useState(blank);
  const [edit, setEdit] = useState<number | null>(null);
  const [error, setError] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (form.end <= form.start)
      return setError("La hora de finalización debe ser posterior a la hora de inicio.");
    const overlap = mine.some(
      (s: Schedule) =>
        s.id !== edit && s.day === form.day && form.start < s.end && form.end > s.start,
    );
    if (overlap)
      return setError("Este horario se superpone con otra disponibilidad del mismo día.");
    const input = {
      subjectId: +form.subjectId,
      day: form.day,
      start: form.start,
      end: form.end,
    };
    const ok = await p.act(
      () => (edit ? api.updateSchedule(edit, input) : api.createSchedule(input)),
      edit ? "Horario actualizado correctamente." : "Nueva disponibilidad agregada.",
      (e: ApiError) => (e.isUserError ? (setError(e.message), true) : false),
    );
    if (!ok) return;
    setForm(blank);
    setEdit(null);
    setError("");
  };
  const remove = (id: number) => p.act(() => api.deleteSchedule(id), "Horario eliminado.");
  return (
    <>
      <PageHead
        eyebrow="CONFIGURACIÓN"
        title="Mi disponibilidad"
        text="Define los horarios en los que puedes impartir tutorías."
      />
      <div className="form-layout availability">
        <form className="card compact-form" onSubmit={save}>
          <h2>{edit ? "Editar horario" : "Agregar horario"}</h2>
          {error && (
            <div className="error-banner">
              <Icon name="alert" />
              {error}
            </div>
          )}
          <label>
            Asignatura
            <select
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
            >
              {p.subjects.map((s: Subject) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Día
            <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="two">
            <label>
              Hora de inicio
              <input
                type="time"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </label>
            <label>
              Hora de fin
              <input
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
          </div>
          <label>
            Capacidad máxima
            <input value="10 estudiantes" readOnly />
            <small>La capacidad es establecida por Coordinación.</small>
          </label>
          <button className="primary wide" type="submit" disabled={p.busy}>
            {edit ? "Guardar cambios" : "Agregar disponibilidad"}
          </button>
          {edit && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEdit(null);
                setForm(blank);
              }}
            >
              Cancelar edición
            </button>
          )}
        </form>
        <section className="card table-card">
          <div className="table-title">
            <h2>Horarios activos</h2>
            <span>{mine.length} en total</span>
          </div>
          <div className="schedule-list">
            {mine.map((s: Schedule) => (
              <article key={s.id}>
                <div className="day-box">
                  <strong>{s.day.slice(0, 3).toUpperCase()}</strong>
                  <span>{s.start}</span>
                </div>
                <div>
                  <h3>{p.subject(s.subjectId).name}</h3>
                  <p>
                    {s.start} – {s.end} · Capacidad: {s.capacity}
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    onClick={() => {
                      setEdit(s.id);
                      setForm({
                        subjectId: String(s.subjectId),
                        day: s.day,
                        start: s.start,
                        end: s.end,
                      });
                    }}
                    aria-label="Editar"
                  >
                    <Icon name="edit" />
                  </button>
                  <button onClick={() => remove(s.id)} aria-label="Eliminar">
                    <Icon name="trash" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Received(p: P) {
  const [tab, setTab] = useState<Status>("Pendiente");
  const scheduleIds = p.schedules
    .filter((s: Schedule) => s.tutorId === p.current.id)
    .map((s: Schedule) => s.id);
  const list = p.requests.filter(
    (r: Request) => scheduleIds.includes(r.scheduleId) && r.status === tab,
  );
  const update = (r: Request, status: "Aprobada" | "Rechazada") =>
    p.act(
      () => api.respondRequest(r.id, status),
      `Solicitud ${status.toLowerCase()} correctamente.`,
    );
  return (
    <>
      <PageHead
        eyebrow="GESTIÓN DE SOLICITUDES"
        title="Solicitudes recibidas"
        text="Revisa y responde las solicitudes enviadas por estudiantes."
      />
      <div className="tabs standalone">
        {(["Pendiente", "Aprobada", "Rechazada"] as Status[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "Pendiente" ? "Pendientes" : t === "Aprobada" ? "Aprobadas" : "Rechazadas"}{" "}
            <b>
              {
                p.requests.filter(
                  (r: Request) => scheduleIds.includes(r.scheduleId) && r.status === t,
                ).length
              }
            </b>
          </button>
        ))}
      </div>
      <div className="request-cards">
        {list.map((r: Request) => {
          const s = p.schedules.find((x: Schedule) => x.id === r.scheduleId);
          const student = p.user(r.studentId);
          return (
            <article className="card received" key={r.id}>
              <header>
                <div className="avatar">
                  {student.name[0]}
                  {student.last[0]}
                </div>
                <div>
                  <h3>
                    {student.name} {student.last}
                  </h3>
                  <p>{student.email}</p>
                </div>
                <Badge status={r.status} />
              </header>
              <div className="session-meta">
                <span>
                  <Icon name="book" />
                  <b>{p.subject(s.subjectId).name}</b>
                </span>
                <span>
                  <Icon name="calendar" />
                  {fmtDate(r.date)} · {s.start}
                </span>
                <span>
                  <Icon name="users" />
                  {Math.max(s.capacity - p.approvedCount(s.id, r.date), 0)} cupos restantes
                </span>
              </div>
              <div className="topics">
                <small>TEMAS SOLICITADOS</small>
                <p>{r.topics}</p>
              </div>
              {r.files.length > 0 && (
                <div className="attachments">
                  {r.files.map((f: string) => (
                    <button key={f}>
                      <Icon name="file" />
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {r.status === "Pendiente" && (
                <footer>
                  <button className="reject" onClick={() => update(r, "Rechazada")}>
                    Rechazar
                  </button>
                  <button
                    className="primary"
                    onClick={() => update(r, "Aprobada")}
                    disabled={p.busy}
                  >
                    <Icon name="check" />
                    Aprobar solicitud
                  </button>
                </footer>
              )}
            </article>
          );
        })}
        {!list.length && <Empty text={`No hay solicitudes ${tab.toLowerCase()}s.`} />}
      </div>
    </>
  );
}

function Results(p: P) {
  const scheduleIds = p.schedules
    .filter((s: Schedule) => s.tutorId === p.current.id)
    .map((s: Schedule) => s.id);
  const eligible = p.requests.filter(
    (r: Request) =>
      scheduleIds.includes(r.scheduleId) &&
      r.status === "Aprobada" &&
      new Date(`${r.date}T23:59:59`) < new Date(),
  );
  const [forms, setForms] = useState<
    Record<number, { attendance: string; level: string; observations: string }>
  >({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const save = (r: Request) => {
    const f = forms[r.id] || { attendance: "", level: "", observations: "" };
    if (!f.attendance || !f.level)
      return setErrors({
        ...errors,
        [r.id]: "Selecciona la asistencia y el nivel de comprensión.",
      });
    p.act(
      () =>
        api.saveResult(r.id, {
          attendance: f.attendance === "yes",
          comprehension: f.level,
          observations: f.observations,
        }),
      "Resultado guardado y estudiante notificado.",
    );
  };
  return (
    <>
      <PageHead
        eyebrow="SEGUIMIENTO ACADÉMICO"
        title="Registrar resultados"
        text="Completa el resultado de las sesiones aprobadas cuya fecha ya pasó."
      />
      <div className="result-list">
        {eligible.map((r: Request) => {
          const s = p.schedules.find((x: Schedule) => x.id === r.scheduleId);
          const f = forms[r.id] || { attendance: "", level: "", observations: "" };
          return (
            <article className="card result-card" key={r.id}>
              <header>
                <div>
                  <p className="eyebrow">{p.subject(s.subjectId).code}</p>
                  <h2>{p.subject(s.subjectId).name}</h2>
                  <span>
                    {p.user(r.studentId).name} {p.user(r.studentId).last} · {fmtDate(r.date)}
                  </span>
                </div>
                <Badge status="Aprobada" />
              </header>
              {errors[r.id] && (
                <div className="error-banner">
                  <Icon name="alert" />
                  {errors[r.id]}
                </div>
              )}
              <div className="result-form">
                <fieldset>
                  <legend>Asistencia *</legend>
                  <label className={f.attendance === "yes" ? "selected" : ""}>
                    <input
                      type="radio"
                      name={`a${r.id}`}
                      onChange={() => setForms({ ...forms, [r.id]: { ...f, attendance: "yes" } })}
                    />
                    <Icon name="check" />
                    Sí asistió
                  </label>
                  <label className={f.attendance === "no" ? "selected" : ""}>
                    <input
                      type="radio"
                      name={`a${r.id}`}
                      onChange={() => setForms({ ...forms, [r.id]: { ...f, attendance: "no" } })}
                    />
                    <Icon name="close" />
                    No asistió
                  </label>
                </fieldset>
                <fieldset>
                  <legend>Nivel de comprensión *</legend>
                  {["Bajo", "Medio", "Alto"].map((l) => (
                    <label key={l} className={f.level === l ? "selected" : ""}>
                      <input
                        type="radio"
                        name={`l${r.id}`}
                        onChange={() => setForms({ ...forms, [r.id]: { ...f, level: l } })}
                      />
                      {l}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Observaciones
                  <textarea
                    rows={3}
                    placeholder="Describe el progreso, dificultades y recomendaciones..."
                    value={f.observations}
                    onChange={(e) =>
                      setForms({ ...forms, [r.id]: { ...f, observations: e.target.value } })
                    }
                  />
                </label>
              </div>
              <footer>
                <button className="primary" onClick={() => save(r)} disabled={p.busy}>
                  Guardar resultado
                </button>
              </footer>
            </article>
          );
        })}
        {!eligible.length && <Empty text="No hay sesiones pendientes de registrar." />}
      </div>
    </>
  );
}

function Users(p: P) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState("");
  const filtered = p.users.filter(
    (u: User) =>
      `${u.name} ${u.last} ${u.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (!role || u.role === role) &&
      (!status || String(u.active) === status),
  );
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget; // se guarda antes del await: luego currentTarget ya es null
    const fd = new FormData(form);
    const email = String(fd.get("email")).toLowerCase();
    if (p.users.some((u: User) => u.email === email && u.id !== editing?.id))
      return setError("Ya existe un usuario registrado con este correo.");
    const data = {
      name: String(fd.get("name")),
      last: String(fd.get("last")),
      email,
      role: String(fd.get("role")) as Role,
      career: String(fd.get("career") || ""),
    };
    const ok = await p.act(
      () => (editing ? api.updateUser(editing.id, data) : api.createUser(data)),
      editing ? "Usuario actualizado." : "Usuario creado correctamente.",
      (e: ApiError) => (e.isUserError ? (setError(e.message), true) : false),
    );
    if (!ok) return;
    setEditing(null);
    setError("");
    form.reset();
  };
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRACIÓN"
        title="Gestión de usuarios"
        text="Administra el acceso de estudiantes, tutores y personal de coordinación."
      />
      <div className="user-layout">
        <section className="card table-card">
          <div className="user-filters">
            <div className="search">
              <Icon name="search" />
              <input
                placeholder="Buscar por nombre o correo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Todos los roles</option>
              <option>Estudiante</option>
              <option>Tutor</option>
              <option>Coordinación</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: User) => (
                  <tr key={u.id}>
                    <td>
                      <strong>
                        {u.name} {u.last}
                      </strong>
                      <small>{u.email}</small>
                    </td>
                    <td>{u.role}</td>
                    <td>
                      <span className={cls("state", u.active ? "on" : "off")}>
                        <i />
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button onClick={() => setEditing(u)}>Editar</button>
                        <button
                          onClick={() =>
                            p.act(
                              () => api.setUserActive(u.id, !u.active),
                              `Usuario ${u.active ? "desactivado" : "activado"}.`,
                            )
                          }
                        >
                          {u.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <form className="card compact-form" onSubmit={save} key={editing?.id || "new"}>
          <p className="eyebrow">{editing ? "EDITAR REGISTRO" : "NUEVO REGISTRO"}</p>
          <h2>{editing ? "Editar usuario" : "Crear usuario"}</h2>
          {error && (
            <div className="error-banner">
              <Icon name="alert" />
              {error}
            </div>
          )}
          <div className="two">
            <label>
              Nombres
              <input name="name" defaultValue={editing?.name} maxLength={100} required />
            </label>
            <label>
              Apellidos
              <input name="last" defaultValue={editing?.last} maxLength={100} required />
            </label>
          </div>
          <label>
            Correo institucional
            <input
              name="email"
              type="email"
              pattern="[^@ ]+@ues\.edu\.sv"
              defaultValue={editing?.email}
              maxLength={150}
              required
              placeholder="carnet@ues.edu.sv"
            />
          </label>
          <label>
            Rol
            <select name="role" defaultValue={editing?.role || "Estudiante"}>
              <option>Estudiante</option>
              <option>Tutor</option>
              <option>Coordinación</option>
            </select>
          </label>
          <label>
            Carrera <small>(solo estudiantes)</small>
            <input name="career" defaultValue={editing?.career} maxLength={100} />
          </label>
          <button className="primary wide" type="submit" disabled={p.busy}>
            {editing ? "Guardar cambios" : "Crear usuario"}
          </button>
          {editing && (
            <button type="button" className="text-button" onClick={() => setEditing(null)}>
              Cancelar edición
            </button>
          )}
        </form>
      </div>
    </>
  );
}

function Subjects(p: P) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [caps, setCaps] = useState<Record<number, number>>({});
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (p.subjects.some((s: Subject) => s.code.toLowerCase() === code.toLowerCase()))
      return setError("Ya existe una asignatura con este código.");
    const ok = await p.act(
      () => api.createSubject(code, name),
      "Asignatura agregada correctamente.",
      (e: ApiError) => (e.isUserError ? (setError(e.message), true) : false),
    );
    if (!ok) return;
    setCode("");
    setName("");
    setError("");
  };
  // La API valida que ningún cupo quede por debajo de las solicitudes aprobadas.
  const saveCaps = async () => {
    const ok = await p.act(() => api.saveCapacities(caps), "Cupos actualizados correctamente.");
    if (ok) setCaps({});
  };
  return (
    <>
      <PageHead
        eyebrow="CONFIGURACIÓN ACADÉMICA"
        title="Asignaturas y cupos"
        text="Administra la oferta de materias y la capacidad de cada horario."
      />
      <form className="card inline-form" onSubmit={add}>
        <div>
          <h2>Agregar asignatura</h2>
          <p>Los códigos deben ser únicos.</p>
        </div>
        <label>
          Código
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ej. PRN215"
            maxLength={20}
            required
          />
        </label>
        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la asignatura"
            maxLength={150}
            required
          />
        </label>
        <button className="primary" type="submit" disabled={p.busy}>
          <Icon name="plus" />
          Agregar
        </button>
        {error && (
          <small className="field-error full">
            <Icon name="alert" />
            {error}
          </small>
        )}
      </form>
      <section className="card table-card">
        <div className="table-title">
          <div>
            <h2>Capacidad por horario</h2>
            <p>El cupo nunca puede ser menor que las solicitudes aprobadas.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asignatura</th>
                <th>Tutor</th>
                <th>Horario</th>
                <th>Aprobadas</th>
                <th>Capacidad máxima</th>
              </tr>
            </thead>
            <tbody>
              {p.schedules.map((s: Schedule) => (
                <tr key={s.id}>
                  <td>
                    <strong>{p.subject(s.subjectId).name}</strong>
                    <small>{p.subject(s.subjectId).code}</small>
                  </td>
                  <td>
                    {p.user(s.tutorId).name} {p.user(s.tutorId).last}
                  </td>
                  <td>
                    {s.day}
                    <small>
                      {s.start} – {s.end}
                    </small>
                  </td>
                  <td>{p.approvedCount(s.id)}</td>
                  <td>
                    <input
                      className="capacity-input"
                      type="number"
                      min={1}
                      max={500}
                      value={caps[s.id] ?? s.capacity}
                      onChange={(e) => setCaps({ ...caps, [s.id]: +e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <button className="secondary" onClick={() => setCaps({})}>
            Descartar cambios
          </button>
          <button className="primary" onClick={saveCaps} disabled={p.busy}>
            Guardar cupos
          </button>
        </div>
      </section>
    </>
  );
}

function Reports(p: P) {
  const [from, setFrom] = useState(iso(-30));
  const [to, setTo] = useState(iso(1));
  const [sub, setSub] = useState("");
  const [applied, setApplied] = useState({ from, to, sub });
  const data = useMemo(
    () =>
      p.requests.filter((r: Request) => {
        const s = p.schedules.find((x: Schedule) => x.id === r.scheduleId);
        return (
          r.date >= applied.from &&
          r.date <= applied.to &&
          (!applied.sub || s.subjectId === +applied.sub)
        );
      }),
    [p.requests, p.schedules, applied],
  );
  const complete = data.filter((r: Request) => r.status === "Realizada");
  const attended = complete.filter((r: Request) => r.attendance);
  const max = Math.max(
    1,
    ...p.subjects.map(
      (s: Subject) =>
        complete.filter(
          (r: Request) =>
            p.schedules.find((x: Schedule) => x.id === r.scheduleId)?.subjectId === s.id,
        ).length,
    ),
  );
  const download = (type: string) =>
    p.showFlash(`El reporte ${type} se preparó correctamente. Descarga simulada completada.`);
  return (
    <>
      <PageHead
        eyebrow="ANÁLISIS ACADÉMICO"
        title="Reportes y estadísticas"
        text="Analiza el desempeño del programa de tutorías por período y asignatura."
        action={
          <div className="export">
            <button className="secondary" onClick={() => download("PDF")}>
              <Icon name="download" />
              Exportar PDF
            </button>
            <button className="secondary" onClick={() => download("Excel")}>
              <Icon name="download" />
              Exportar Excel
            </button>
          </div>
        }
      />
      <section className="card report-filter">
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Asignatura
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">Todas las asignaturas</option>
            {p.subjects.map((s: Subject) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          onClick={() => {
            if (!from || !to)
              return p.showFlash("Indica la fecha inicial y la fecha final.", "error");
            if (from > to)
              return p.showFlash("La fecha inicial no puede ser posterior a la final.", "error");
            setApplied({ from, to, sub });
          }}
        >
          Generar reporte
        </button>
      </section>
      <section className="stats report-stats">
        <Stat
          label="Solicitudes recibidas"
          value={data.length}
          detail="En el período"
          icon="file"
        />
        <Stat
          label="Aprobadas"
          value={data.filter((r: Request) => ["Aprobada", "Realizada"].includes(r.status)).length}
          detail="Incluye realizadas"
          icon="check"
        />
        <Stat
          label="Completadas"
          value={complete.length}
          detail="Resultados registrados"
          icon="calendar"
        />
        <Stat
          label="Asistencia"
          value={`${complete.length ? Math.round((attended.length / complete.length) * 100) : 0}%`}
          detail={`${attended.length} asistencias`}
          icon="users"
        />
      </section>
      <div className="report-grid">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h2>Tutorías completadas</h2>
              <p>Distribución por asignatura</p>
            </div>
          </div>
          <div className="bar-chart">
            {p.subjects.map((s: Subject) => {
              const val = complete.filter(
                (r: Request) =>
                  p.schedules.find((x: Schedule) => x.id === r.scheduleId)?.subjectId === s.id,
              ).length;
              return (
                <div key={s.id}>
                  <span>{s.code}</span>
                  <div>
                    <i style={{ width: `${(val / max) * 100}%` }} />
                  </div>
                  <b>{val}</b>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Nivel de comprensión</h2>
              <p>Resultados de sesiones completadas</p>
            </div>
          </div>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Nivel</th>
                <th>Estudiantes</th>
                <th>Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {["Alto", "Medio", "Bajo"].map((l) => {
                const n = complete.filter((r: Request) => r.comprehension === l).length;
                return (
                  <tr key={l}>
                    <td>
                      <span className={`level ${l.toLowerCase()}`}>{l}</span>
                    </td>
                    <td>{n}</td>
                    <td>{complete.length ? Math.round((n / complete.length) * 100) : 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

export default App;
