# Servidor de SIGTAU

Servidor Express que expone la API REST (`/api`) sobre la base de datos SQLite (`database/`).
Si existe el build del frontend (`dist/`, generado con `npm run build`), el mismo proceso también lo sirve,
con lo que toda la aplicación corre en un único proceso y un único puerto. Por defecto solo escucha en `127.0.0.1`.
Pasos de despliegue: ver el `README.md` de la raíz.

## Puesta en marcha (en cualquier computadora)

```bash
npm install
npm run db:reset    # crea y siembra database/sigtau.db (solo la primera vez o para reiniciar datos)
npm run dev:full    # API (puerto 3001) + frontend (Vite) a la vez
```

Por separado: `npm run api` (o `npm run api:watch`, que reinicia al editar) y `npm run dev`.
Vite reenvía todo lo que empiece con `/api` a la API, así que el frontend no necesita configuración extra.

> Si abres solo `npm run dev` sin la API, el login mostrará "No se pudo conectar con el servidor".
> No ejecutes `db:reset` mientras la API está corriendo: detenla primero.

| Variable                  | Por defecto                   | Uso                                                                                       |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                | —                             | `production` activa avisos de configuración y bloquea los scripts que borran datos        |
| `API_PORT` / `PORT`       | `3001`                        | Puerto del servidor (`API_PORT` tiene prioridad; Vite lo usa para el proxy en desarrollo) |
| `API_HOST`                | `127.0.0.1`                   | Interfaz en la que escucha. Usar `0.0.0.0` en contenedores o servicios gestionados        |
| `TRUST_PROXY`             | —                             | `1` si hay un proxy inverso delante, para que `req.ip` sea la IP real del cliente         |
| `SIGTAU_DB`               | `database/sigtau.db`          | Ruta del archivo SQLite                                                                   |
| `SIGTAU_SECRET`           | se genera en `server/.secret` | Secreto para firmar los tokens de sesión (obligatorio en la práctica en producción)       |
| `SIGTAU_DEFAULT_PASSWORD` | `demo1234`                    | Contraseña inicial de los usuarios creados desde Coordinación                             |

## Autenticación

`POST /api/auth/login` devuelve un token firmado (HMAC-SHA256, 8 h). El resto de rutas lo piden en
`Authorization: Bearer <token>`. En cada petición se vuelve a leer el usuario de la BD, así que
desactivar a alguien le corta el acceso de inmediato.

## Endpoints

| Método y ruta                       | Rol          | Qué hace                                                 |
| ----------------------------------- | ------------ | -------------------------------------------------------- |
| `GET /api/health`                   | —            | Comprobación de salud (`{ "status": "ok" }`)             |
| `POST /api/auth/login`              | —            | Inicia sesión                                            |
| `GET /api/bootstrap`                | cualquiera   | Todos los datos que necesita la UI, filtrados por rol    |
| `POST /api/requests`                | Estudiante   | Crea una solicitud (+ notifica al tutor)                 |
| `PATCH /api/requests/:id/cancel`    | Estudiante   | Cancela la propia (mínimo 24 h de anticipación)          |
| `PATCH /api/requests/:id/status`    | Tutor        | Aprueba/rechaza una pendiente (valida cupo de esa fecha) |
| `PUT /api/requests/:id/result`      | Tutor        | Registra asistencia, comprensión y observaciones         |
| `POST /api/schedules`               | Tutor        | Agrega un horario propio (sin traslapes)                 |
| `PUT /api/schedules/:id`            | Tutor        | Edita un horario propio                                  |
| `DELETE /api/schedules/:id`         | Tutor        | Elimina un horario propio sin solicitudes                |
| `PUT /api/schedules/capacities`     | Coordinación | Guarda cupos `{ capacities: { "<id>": n } }`             |
| `POST /api/users`                   | Coordinación | Crea usuario                                             |
| `PUT /api/users/:id`                | Coordinación | Edita usuario                                            |
| `PATCH /api/users/:id/active`       | Coordinación | Activa/desactiva                                         |
| `POST /api/subjects`                | Coordinación | Crea asignatura                                          |
| `PATCH /api/notifications/:id/read` | cualquiera   | Marca una notificación propia como leída                 |
| `POST /api/notifications/read-all`  | cualquiera   | Marca todas las propias como leídas                      |

## Errores y validación

Todos los errores tienen la misma forma:

```json
{
  "error": "Mensaje para el usuario",
  "code": "VALIDATION",
  "fields": { "email": "El correo debe ser institucional (@ues.edu.sv)." }
}
```

- `error`: texto en español listo para mostrar. En errores de validación junta los mensajes de todos los campos.
- `code`: identificador estable (`VALIDATION`, `DUPLICATE`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_LARGE`, `TOO_MANY_ATTEMPTS`, `DB_BUSY`, `INTERNAL`...).
- `fields` (solo validación y duplicados): mensaje por campo, para marcar cada input.

| Código HTTP | Cuándo                                                                            |
| ----------- | --------------------------------------------------------------------------------- |
| 400         | Datos inválidos (se reportan **todos** los campos con error a la vez)             |
| 401         | Sin sesión, sesión vencida o credenciales incorrectas                             |
| 403         | El rol no puede hacer la acción, o el recurso es de otro usuario                  |
| 404         | El recurso o la ruta no existen                                                   |
| 409         | Conflicto con el estado actual (duplicado, sin cupo, fuera de plazo, relacionado) |
| 413         | Cuerpo de la petición mayor a 100 KB                                              |
| 429         | Demasiados intentos de login                                                      |
| 500 / 503   | Error interno (incluye un código de rastreo) / base de datos ocupada              |

Cada respuesta incluye la cabecera `X-Request-Id`. Los errores 500 se registran en la consola de la API
con ese mismo código, que también se muestra al usuario, para poder encontrarlos.
Los errores de SQLite (restricciones, bloqueos) se traducen a respuestas comprensibles; nunca se filtran detalles internos.

### Reglas de validación

- **Ids** (ruta o cuerpo): enteros positivos. Se rechazan `true`, `1e0`, `1.5`, `0`, etc.
- **Textos**: se recortan, no admiten caracteres de control (los textos largos sí permiten saltos de línea) y tienen largo máximo.
- **Correo**: institucional `@ues.edu.sv`, máx. 150. **Nombres y carrera**: máx. 100. **Código de asignatura**: letras, números y guiones, 2–20 caracteres.
- **Solicitud**: fecha posterior a hoy y no mayor a 180 días, que caiga en el día del horario; temas de 20 a 1000 caracteres;
  hasta 3 archivos `.pdf/.docx/.png/.jpg/.jpeg`; no se permite una segunda solicitud activa para la misma sesión;
  se rechaza si la sesión de esa fecha ya no tiene cupos o si el tutor está inactivo.
- **Horarios**: horas `HH:MM`, fin posterior al inicio, sin traslapes. **Cupos**: enteros de 1 a 500 y nunca menores a las aprobadas;
  si uno es inválido no se guarda ninguno.
- **Resultado**: asistencia (`true/false`) y comprensión (`Bajo/Medio/Alto`) obligatorias; observaciones hasta 2000 caracteres.

### Protección del login

Tras 5 intentos fallidos para el mismo correo, ese correo queda bloqueado 60 segundos (429 con `Retry-After`).
Un correo inexistente responde igual de rápido y con el mismo mensaje que una clave incorrecta, para no revelar qué cuentas existen.
El bloqueo es en memoria: se reinicia al reiniciar la API.

## Qué ve cada rol en `/api/bootstrap`

- **Estudiante:** sus solicitudes, los tutores y a sí mismo. No ve correos de otros usuarios.
- **Tutor:** las solicitudes de sus horarios, los estudiantes que le escribieron (con correo) y los tutores.
- **Coordinación:** todo.

## Estructura

```
server/
├── index.mjs          arranque de Express y manejo de errores
├── auth.mjs           tokens y middlewares authenticate / requireRole
├── http.mjs           HttpError, constantes y manejador global de errores
├── validate.mjs       Validator (errores por campo), ids estrictos, fechas locales
├── throttle.mjs       límite de intentos de login
├── serialize.mjs      fila de BD (snake_case) -> objeto del frontend (camelCase)
├── notify.mjs         inserta notificaciones
└── routes/            session, admin, schedules, requests, notifications
```

## Limitaciones conocidas

- Los archivos adjuntos solo guardan el **nombre** (como hacía el frontend); no se suben ni almacenan.
- Un horario que ya tiene solicitudes (de cualquier estado) no se puede eliminar.
- El servidor no implementa HTTPS: en producción debe ir detrás de un proxy inverso que lo provea (ver el `README.md` de la raíz).
- Está pensado para una sola instancia (SQLite); el bloqueo de login es en memoria.
