# Base de datos de SIGTAU

Base de datos **SQLite** local: un solo archivo (`database/sigtau.db`), sin instalar ni levantar ningún servidor.
Funciona igual en macOS, Windows y Linux.

## Requisitos

- Node.js 20 o superior
- Haber instalado dependencias: `npm install`

## Uso

```bash
npm run db:create   # crea database/sigtau.db con las tablas (falla si ya existe)
npm run db:seed     # carga los datos de demostración
npm run db:reset    # borra la base, la recrea y la siembra (atajo de los dos anteriores)
npm run db:admin -- --email coordinacion@ues.edu.sv --name Rosa --last Chávez   # primera cuenta de Coordinación
```

Para recrear solo la estructura vacía: `npm run db:create -- --reset`.
`db:seed` es idempotente: puedes ejecutarlo cuantas veces quieras, siempre deja los mismos datos.

Para usar otra ubicación del archivo: `SIGTAU_DB=/ruta/otra.db npm run db:reset`.

### Producción

- `db:seed` y `db:create -- --reset` **borran todos los datos**. Con `NODE_ENV=production` se niegan a ejecutarse salvo que se agregue `--force`.
- `db:admin` crea una cuenta de Coordinación sin cargar datos de demostración. Si no se indica `--password` (ni `SIGTAU_ADMIN_PASSWORD`) genera una contraseña aleatoria y la muestra una sola vez.
  Con `--reset-password` restablece la contraseña de una cuenta existente y la reactiva.

## Archivos

| Archivo            | Qué hace                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| `schema.sql`       | Estructura: tablas, restricciones, índices y triggers                                 |
| `create.mjs`       | Script de creación: ejecuta `schema.sql` y genera `sigtau.db`                         |
| `seed.mjs`         | Script de seeds: datos de demostración (los mismos que estaban quemados en `App.tsx`) |
| `create-admin.mjs` | Crea o restablece una cuenta de Coordinación (para producción)                        |
| `db.mjs`           | Utilidades compartidas: ruta de la BD, conexión y hash de contraseñas (scrypt)        |

`sigtau.db` está en `.gitignore`: cada computadora genera la suya con los scripts.

## Modelo de datos

```
users ──┬─< schedules >── subjects
        │        │
        │        └─< requests ──< request_files
        │               │
        └───────────────┘ (student_id)
users ──< notifications
```

| Tabla           | Contenido                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------- |
| `users`         | Estudiantes, tutores y coordinación. Contraseña hasheada con scrypt                          |
| `subjects`      | Asignaturas (código único)                                                                   |
| `schedules`     | Horario semanal de un tutor para una asignatura, con `capacity`                              |
| `requests`      | Solicitud de un estudiante a un horario en una fecha; incluye el resultado si es "Realizada" |
| `request_files` | Archivos adjuntos de cada solicitud                                                          |
| `notifications` | Avisos por usuario, con `target` (página del frontend) e `is_read`                           |

### Reglas que la base de datos ya garantiza

- Correo único (sin distinguir mayúsculas) y del dominio `@ues.edu.sv`; código de asignatura único.
- `schedules.tutor_id` debe ser un usuario con rol Tutor; `requests.student_id`, uno con rol Estudiante.
- Días válidos (Lunes–Sábado), `end_time > start_time`, `capacity >= 1`, y un tutor no repite día + hora de inicio.
- Estados de solicitud válidos. Asistencia, comprensión y observaciones **solo** existen cuando el estado es `Realizada`, y entonces asistencia y comprensión son obligatorias.
- No se puede borrar un usuario, asignatura u horario con datos asociados (`ON DELETE RESTRICT`). Borrar una solicitud elimina sus archivos; borrar un usuario elimina sus notificaciones.

### Reglas que valida la API (lógica de negocio)

Cupo al aprobar, cancelación con 24 h de anticipación, traslape de horarios del mismo tutor,
fecha de sesión futura que coincida con el día del horario y máximo de 3 archivos.
Ver [`server/README.md`](../server/README.md).

## Datos de demostración

Contraseña de todas las cuentas: `demo1234`

| Rol          | Correo              |
| ------------ | ------------------- |
| Estudiante   | `andrea@ues.edu.sv` |
| Tutor        | `marta@ues.edu.sv`  |
| Coordinación | `rosa@ues.edu.sv`   |

Hay 8 usuarios, 5 asignaturas, 6 horarios, 11 solicitudes y 4 notificaciones. Las fechas de las solicitudes se calculan
respecto al día en que se ejecuta el seed (igual que hacía el frontend).

## Consultar la base a mano

```bash
sqlite3 database/sigtau.db "SELECT * FROM users;"   # si tienes el cliente sqlite3
```

También sirve cualquier visor gráfico (DB Browser for SQLite, TablePlus, DBeaver…) abriendo `database/sigtau.db`.
