# SIGTAU

Sistema de Gestión de Tutorías Académicas Universitarias, desarrollado para la Universidad de El Salvador.

SIGTAU permite que los estudiantes soliciten tutorías, que los tutores publiquen su disponibilidad,
aprueben solicitudes y registren los resultados de cada sesión, y que Coordinación administre usuarios,
asignaturas, cupos y reportes.

## Contenido

- [Funcionalidades](#funcionalidades)
- [Arquitectura y tecnologías](#arquitectura-y-tecnologías)
- [Requisitos](#requisitos)
- [Instalación y ejecución en desarrollo](#instalación-y-ejecución-en-desarrollo)
- [Cuentas de demostración](#cuentas-de-demostración)
- [Scripts disponibles](#scripts-disponibles)
- [Variables de entorno](#variables-de-entorno)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Despliegue en producción](#despliegue-en-producción)
- [Seguridad](#seguridad)
- [Solución de problemas](#solución-de-problemas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Documentación adicional](#documentación-adicional)

## Funcionalidades

**Estudiante**

- Consulta de tutores, asignaturas y horarios disponibles.
- Solicitud de tutorías con tema, fecha y archivos de apoyo (se registra el nombre del archivo).
- Cancelación de solicitudes propias con un mínimo de 24 horas de anticipación.
- Notificaciones sobre el estado de sus solicitudes.

**Tutor**

- Gestión de horarios propios, sin traslapes.
- Aprobación o rechazo de solicitudes pendientes, con control de cupo por fecha.
- Registro del resultado de cada tutoría: asistencia, nivel de comprensión y observaciones.

**Coordinación**

- Alta, edición, activación y desactivación de usuarios.
- Alta de asignaturas.
- Configuración de cupos por horario.
- Vista global de solicitudes y reportes.

Cada rol recibe únicamente los datos que le corresponden, y las reglas de negocio se validan en el servidor.

## Arquitectura y tecnologías

| Capa          | Tecnología                                                                |
| ------------- | ------------------------------------------------------------------------- |
| Frontend      | React 19, Vite 8, Tailwind CSS 4, TypeScript                              |
| API           | Node.js 20+, Express 5 (módulos ESM)                                      |
| Base de datos | SQLite mediante `better-sqlite3` (modo WAL, claves foráneas activadas)    |
| Autenticación | Tokens firmados con HMAC-SHA256 (8 horas) y contraseñas con scrypt        |
| Herramientas  | oxfmt (formato), `tsc` (verificación de tipos), concurrently (desarrollo) |

En desarrollo, Vite sirve el frontend en el puerto 5173 y reenvía las rutas `/api` a la API (puerto 3001).
En producción, un único proceso de Node.js sirve la API y el frontend compilado desde el mismo puerto,
por lo que no se requiere un servidor web adicional (aunque se recomienda un proxy inverso para HTTPS).

## Requisitos

- Node.js 20 o superior y npm.
- Herramientas de compilación nativas para `better-sqlite3`, solo si no existe un binario precompilado para
  su plataforma (en Linux: `build-essential` y `python3`; en macOS: Xcode Command Line Tools).

## Instalación y ejecución en desarrollo

```bash
git clone <URL-DEL-REPOSITORIO> sigtau
cd sigtau
npm install
npm run db:reset    # crea y carga la base de datos local (database/sigtau.db)
npm run dev:full    # API en el puerto 3001 y frontend en http://localhost:5173
```

Abra `http://localhost:5173` e inicie sesión con una de las cuentas de demostración.

Si ejecuta solo `npm run dev` sin la API, la pantalla de inicio de sesión mostrará
"No se pudo conectar con el servidor". No ejecute `npm run db:reset` mientras la API esté corriendo.

## Cuentas de demostración

Disponibles después de ejecutar `npm run db:reset` o `npm run db:seed`. La contraseña de todas es `demo1234`.

| Rol          | Correo              |
| ------------ | ------------------- |
| Estudiante   | `andrea@ues.edu.sv` |
| Tutor        | `marta@ues.edu.sv`  |
| Coordinación | `rosa@ues.edu.sv`   |

Las fechas de los datos de demostración son relativas al día en que se ejecuta `db:seed`.
Estas cuentas son solo para desarrollo y presentaciones: no deben existir en un entorno de producción.

## Scripts disponibles

| Comando             | Descripción                                                                            |
| ------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev:full`  | API y frontend a la vez, con recarga automática                                        |
| `npm run dev`       | Solo el frontend (Vite)                                                                |
| `npm run api`       | Solo la API (`npm run api:watch` la reinicia al editar archivos)                       |
| `npm run build`     | Compila el frontend en `dist/`                                                         |
| `npm start`         | Inicia el servidor (API y, si existe `dist/`, el frontend compilado)                   |
| `npm run preview`   | Previsualiza el build con Vite (requiere la API en ejecución)                          |
| `npm run db:create` | Crea la base de datos vacía a partir de `database/schema.sql` (`-- --reset` la recrea) |
| `npm run db:seed`   | Carga los datos de demostración (borra los datos existentes)                           |
| `npm run db:reset`  | Recrea la base de datos y la siembra                                                   |
| `npm run db:admin`  | Crea o restablece una cuenta de Coordinación (uso en producción)                       |
| `npm run typecheck` | Verificación de tipos de TypeScript                                                    |
| `npm run format`    | Formatea el código con oxfmt                                                           |

## Variables de entorno

Todas son opcionales en desarrollo. No existe un archivo `.env`: las variables se definen en el entorno del
proceso (en producción, por ejemplo, mediante el archivo `EnvironmentFile` de systemd o el panel del proveedor).

| Variable                  | Por defecto                   | Descripción                                                                                    |
| ------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | sin definir                   | `production` bloquea los scripts que borran datos y activa avisos de configuración             |
| `API_PORT` / `PORT`       | `3001`                        | Puerto del servidor (`API_PORT` tiene prioridad)                                               |
| `API_HOST`                | `127.0.0.1`                   | Interfaz de red en la que escucha. Use `0.0.0.0` en contenedores o servicios gestionados       |
| `TRUST_PROXY`             | sin definir                   | `1` si hay un proxy inverso delante, para registrar la IP real del cliente                     |
| `SIGTAU_DB`               | `database/sigtau.db`          | Ruta del archivo SQLite                                                                        |
| `SIGTAU_SECRET`           | se genera en `server/.secret` | Secreto para firmar los tokens de sesión. Defínalo explícitamente en producción                |
| `SIGTAU_DEFAULT_PASSWORD` | `demo1234`                    | Contraseña inicial de los usuarios creados desde Coordinación (la interfaz no pide contraseña) |
| `SIGTAU_ADMIN_PASSWORD`   | sin definir                   | Contraseña para `npm run db:admin` (alternativa a `--password`)                                |

## Estructura del proyecto

```
.
├── src/                 Frontend: App.tsx, api.ts (cliente de la API), ErrorBoundary.tsx, index.css
├── public/              Archivos estáticos
├── server/              API Express: autenticación, rutas y validaciones    (ver server/README.md)
├── database/            Esquema SQLite, creación, seeds y utilidades        (ver database/README.md)
├── index.html           Punto de entrada de Vite
├── vite.config.ts       Configuración de Vite (incluye el proxy de /api en desarrollo)
└── package.json
```

## Despliegue en producción

Esta sección describe el despliegue en un servidor Linux propio (VPS o máquina virtual) con systemd y nginx.
La aplicación es un único proceso de Node.js con una base de datos SQLite en disco, por lo que
**solo debe ejecutarse una instancia** y la base de datos debe residir en un disco persistente.

### 1. Preparar el servidor

Instale Node.js 20 o superior, git y las herramientas de compilación, y cree un usuario sin privilegios:

```bash
sudo apt update
sudo apt install -y git build-essential python3 nginx sqlite3
# Node.js 20+: https://nodejs.org o el repositorio NodeSource
sudo useradd --system --create-home --shell /usr/sbin/nologin sigtau
sudo mkdir -p /opt/sigtau /var/lib/sigtau /etc/sigtau
sudo chown sigtau:sigtau /opt/sigtau /var/lib/sigtau
```

### 2. Obtener el código e instalar dependencias

```bash
sudo -u sigtau git clone <URL-DEL-REPOSITORIO> /opt/sigtau
cd /opt/sigtau
sudo -u sigtau npm ci
```

### 3. Generar el build del frontend

```bash
sudo -u sigtau npm run build
```

Esto crea `dist/`, que el servidor detecta y sirve automáticamente.

### 4. Configurar las variables de entorno

Genere un secreto aleatorio:

```bash
openssl rand -hex 32
```

Cree `/etc/sigtau/sigtau.env` con el siguiente contenido (reemplace el secreto):

```ini
NODE_ENV=production
API_PORT=3001
API_HOST=127.0.0.1
TRUST_PROXY=1
SIGTAU_DB=/var/lib/sigtau/sigtau.db
SIGTAU_SECRET=<secreto-generado>
```

Restrinja el acceso al archivo:

```bash
sudo chown root:sigtau /etc/sigtau/sigtau.env
sudo chmod 640 /etc/sigtau/sigtau.env
```

### 5. Crear la base de datos y la primera cuenta

Cargue las variables en la sesión actual y cree la base de datos vacía:

```bash
set -a; . /etc/sigtau/sigtau.env; set +a
sudo -E -u sigtau npm run db:create
```

Cree la primera cuenta de Coordinación. Si no indica `--password` se genera una contraseña aleatoria
que se muestra una única vez; guárdela en un lugar seguro:

```bash
sudo -E -u sigtau npm run db:admin -- --email coordinacion@ues.edu.sv --name Nombre --last Apellido
```

Desde esa cuenta se crean los demás usuarios (tutores y estudiantes), asignaturas y cupos desde la interfaz.
Los usuarios creados desde Coordinación reciben la contraseña definida en `SIGTAU_DEFAULT_PASSWORD`
(por defecto `demo1234`); defina un valor propio en `sigtau.env` antes de crearlos.

Opcional, solo para un entorno de pruebas o una demostración pública: `npm run db:seed -- --force`
carga los datos de ejemplo. En producción real **no** lo ejecute: borra todos los datos existentes y crea cuentas
con contraseñas conocidas.

### 6. Servicio systemd

Cree `/etc/systemd/system/sigtau.service` (ajuste la ruta de `node` con `which node`):

```ini
[Unit]
Description=SIGTAU
After=network.target

[Service]
Type=simple
User=sigtau
WorkingDirectory=/opt/sigtau
EnvironmentFile=/etc/sigtau/sigtau.env
ExecStart=/usr/bin/node server/index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/sigtau /opt/sigtau/server

[Install]
WantedBy=multi-user.target
```

Active e inicie el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sigtau
sudo systemctl status sigtau
journalctl -u sigtau -f
```

### 7. Proxy inverso y HTTPS con nginx

Cree `/etc/nginx/sites-available/sigtau` (reemplace `tutorias.ejemplo.edu.sv` por su dominio):

```nginx
server {
    listen 80;
    server_name tutorias.ejemplo.edu.sv;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sigtau /etc/nginx/sites-enabled/sigtau
sudo nginx -t && sudo systemctl reload nginx
```

Habilite HTTPS con Let's Encrypt (el DNS del dominio debe apuntar al servidor):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tutorias.ejemplo.edu.sv
```

El tráfico de la aplicación incluye contraseñas y tokens de sesión: **no debe publicarse sin HTTPS**.
Abra solo los puertos 80 y 443 en el firewall; el puerto 3001 debe quedar accesible únicamente desde el propio servidor.

### 8. Verificar el despliegue

```bash
curl http://127.0.0.1:3001/api/health
# {"status":"ok"}
```

Luego abra `https://tutorias.ejemplo.edu.sv` en el navegador e inicie sesión con la cuenta de Coordinación.

### Despliegue en un servicio gestionado (PaaS)

El mismo proceso puede ejecutarse en plataformas como Render, Railway o Fly.io, con estas condiciones:

- Comando de build: `npm ci && npm run build`. Comando de inicio: `npm start`.
- Variables de entorno: `NODE_ENV=production`, `API_HOST=0.0.0.0`, `SIGTAU_SECRET`, `SIGTAU_DB` (ruta dentro del volumen
  persistente) y `TRUST_PROXY=1`. El puerto lo suele proporcionar la plataforma mediante `PORT`.
- La base de datos debe estar en un **volumen persistente**. En plataformas con sistema de archivos efímero se perderían
  los datos en cada despliegue.
- Antes del primer uso, cree la base de datos y la cuenta de Coordinación ejecutando `npm run db:create` y `npm run db:admin`
  en una consola o tarea única dentro del mismo entorno (con las mismas variables y el mismo volumen).
- Configure la ruta `/api/health` como comprobación de salud.
- Ejecute una sola instancia de la aplicación.

### Actualizar a una nueva versión

```bash
cd /opt/sigtau
sudo -u sigtau git pull
sudo -u sigtau npm ci
sudo -u sigtau npm run build
sudo systemctl restart sigtau
```

El esquema de la base de datos (`database/schema.sql`) se aplica solo al crearla. Si una versión nueva modifica el esquema,
hay que migrar los datos manualmente (no existe un mecanismo de migraciones). Haga un respaldo antes de actualizar.

### Respaldos

La base de datos usa el modo WAL, por lo que **no debe copiarse el archivo directamente mientras el servidor está activo**.
Use el comando de respaldo de SQLite, que es consistente en caliente:

```bash
sudo -u sigtau sqlite3 /var/lib/sigtau/sigtau.db ".backup '/var/backups/sigtau-$(date +%F).db'"
```

Se recomienda programarlo (por ejemplo con cron o un temporizador de systemd), conservar copias fuera del servidor
y probar periódicamente la restauración. Para restaurar, detenga el servicio y reemplace el archivo de la base de datos.

## Seguridad

Lista de verificación antes de publicar:

- [ ] `SIGTAU_SECRET` definido con un valor aleatorio largo y distinto en cada entorno.
- [ ] HTTPS habilitado y proxy inverso configurado con `TRUST_PROXY=1`.
- [ ] No se cargaron los datos de demostración y no existen las cuentas `demo1234`.
- [ ] `SIGTAU_DEFAULT_PASSWORD` cambiado por un valor propio.
- [ ] El puerto de la aplicación no está expuesto directamente a Internet.
- [ ] El archivo de la base de datos y `/etc/sigtau/sigtau.env` solo son legibles por el usuario del servicio.
- [ ] Respaldos periódicos configurados y probados.

Medidas incluidas en la aplicación:

- Contraseñas almacenadas con scrypt y sal individual; los tokens de sesión expiran a las 8 horas.
- El usuario se vuelve a consultar en la base de datos en cada petición: desactivar una cuenta corta el acceso de inmediato.
- Bloqueo temporal tras 5 intentos fallidos de inicio de sesión para el mismo correo (60 segundos).
- Validación estricta de todos los datos de entrada en el servidor, con errores por campo.
- Cabeceras de seguridad y política de contenido (CSP) cuando el servidor entrega el frontend compilado.
- Los scripts que borran datos se niegan a ejecutarse con `NODE_ENV=production` salvo que se use `--force`.

## Solución de problemas

| Síntoma                                              | Causa probable y solución                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "No se pudo conectar con el servidor" en el login    | La API no está corriendo. Use `npm run dev:full` (desarrollo) o revise `systemctl status sigtau`.        |
| `EADDRINUSE` al iniciar                              | El puerto ya está en uso. Cambie `API_PORT` o detenga el otro proceso.                                   |
| La base de datos no existe                           | Ejecute `npm run db:create` (con `SIGTAU_DB` definido si usa una ruta personalizada).                    |
| `db:seed` o `db:create --reset` se niegan a ejecutar | Es el bloqueo de `NODE_ENV=production`. Use `--force` solo si está seguro de que desea borrar los datos. |
| Las sesiones se cierran al reiniciar el servidor     | `SIGTAU_SECRET` no está definido y `server/.secret` no persiste. Defina `SIGTAU_SECRET`.                 |
| Error 429 al iniciar sesión                          | Demasiados intentos fallidos. Espere 60 segundos.                                                        |
| Falla `npm ci` al compilar `better-sqlite3`          | Instale las herramientas de compilación (`build-essential` y `python3`) y use Node.js 20 o superior.     |
| Cambios de la interfaz no visibles en producción     | Ejecute `npm run build` y reinicie el servicio.                                                          |

## Limitaciones conocidas

- Los archivos adjuntos de las solicitudes solo guardan el nombre; no se suben ni se almacenan.
- La interfaz no incluye cambio de contraseña. Un administrador puede restablecerla con `npm run db:admin -- --email <correo> --reset-password`.
- Un horario que tiene solicitudes (de cualquier estado) no puede eliminarse.
- No hay mecanismo de migraciones: `database/schema.sql` solo se aplica al crear la base de datos.
- El bloqueo por intentos fallidos de inicio de sesión se mantiene en memoria y se reinicia con el servidor.
- Las tipografías se cargan desde Google Fonts; sin conexión a Internet se usan las del sistema.
- SQLite con una sola instancia es adecuado para una carga moderada; no es un diseño pensado para varias réplicas.

## Documentación adicional

- [server/README.md](server/README.md): endpoints de la API, formato de errores y reglas de validación.
- [database/README.md](database/README.md): esquema, restricciones, datos de demostración y scripts de base de datos.

## Licencia

Este repositorio aún no define una licencia. Agregue un archivo `LICENSE` antes de publicarlo si desea
establecer los términos de uso y distribución.
