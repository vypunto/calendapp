# Despliegue en Vercel + Neon + GitHub

CalendApp se despliega como sitio estático (`index.html`) más funciones de Node en `/api` (carpeta `server/`), con Postgres en Neon.
El backend PHP de `api/` (`*.php`) se conserva como referencia para hosting con PHP y **no** se despliega en Vercel (`.vercelignore`). La web llama a `/api/index` (sin `.php`, porque Vercel bloquea las rutas `.php`).

## 1. Neon (base de datos)
1. Crea un proyecto en neon.tech y copia la cadena de conexión **pooled** (`…-pooler…?sslmode=require`).
2. No hay que crear tablas: se crean solas en la primera petición (`server/db.js`, migraciones idempotentes) y se siembran los 5 proyectos y las 5 cuentas iniciales (sin credenciales).

## 2. Vercel
1. *Add New → Project* → importa `nicoromovcnl-max/calendapp`. Framework: *Other*. Sin comando de build.
2. En *Settings → Environment Variables* define (ver `.env.example`):
   `DATABASE_URL`, `APP_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `APP_URL`.
   Además, `INITIAL_TEAM_PASSWORD`: contraseña inicial de los usuarios del equipo (v.santiago, m.guerrero y n.romo @grupoelchandrio.com). Solo se usa la primera vez que se crea cada usuario; cada uno debe cambiarla en su primer acceso. Tras el primer despliegue se puede borrar.
3. Despliega. Abre `https://TU-DOMINIO/api/index?r=status`: cada bandera de `configured` debe estar en `true`.

## 3. App de Meta
- Producto: *API de Instagram con inicio de sesión de Instagram*.
- URI de redireccionamiento OAuth (exacta): `https://TU-DOMINIO/api/instagram-callback` (= `META_REDIRECT_URI`).
- Roles → *Instagram testers*: añade las cuentas (Business o Creator) y acepta la invitación desde cada una.
- Sin la revisión de la app, solo funcionan las cuentas que son testers.

## 4. Programación (scheduler)
Publicar lo programado lo hace el backend, no el navegador. Hay que **llamar** a `GET /api/cron?job=publish` con `Authorization: Bearer $CRON_SECRET`:
- **GitHub Actions** (incluido): `.github/workflows/scheduler.yml`, cada 5 minutos (mínimo de GitHub; puede retrasarse unos minutos).
  Secretos del repositorio: `CALENDAPP_URL` (`https://TU-DOMINIO`) y `CRON_SECRET`.
- **Precisión al minuto**: un cron externo (p. ej. cron-job.org, gratis) con la misma URL y cabecera, o Vercel Cron en plan Pro.
- La renovación de tokens (`?job=refresh`) va en `vercel.json` una vez al día (compatible con el plan gratuito).
- Es seguro llamar varias veces: cada destino se reserva de forma atómica y no se publica dos veces.

### Programador fiable (recomendado): cron-job.org, cada minuto
GitHub Actions no garantiza la hora (puede tardar horas en empezar y saltarse ejecuciones). Para publicar a la hora exacta:
1. Crea una cuenta gratuita en **cron-job.org** → *Create cronjob*.
2. **URL:** `https://TU-DOMINIO/api/cron?job=publish`
3. **Schedule:** cada 1 minuto.
4. En *Advanced → Headers* añade `Authorization` con valor `Bearer TU_CRON_SECRET` (el mismo de Vercel).
5. Guarda. En CalendApp → Ajustes → Integraciones, la fila **Programador de publicaciones** debe pasar a «Activo».
- Si algo programado se retrasa, esa misma fila muestra cuántas están vencidas y tiene el botón **Publicar vencidas ahora**. Además, mientras un administrador tiene la app abierta, las vencidas se publican solas como respaldo.

## 5. Primera prueba real
1. Abre la app, inicia sesión con el acceso de equipo (misma contraseña que `ADMIN_PASSWORD` para abrir la sesión del servidor).
2. Ajustes → Integraciones → *Conectar Instagram* → autoriza en Instagram.
3. Nueva publicación con una imagen JPG simple → *Publicar ahora* → comprueba el perfil.
4. Programa otra a +10 min y comprueba que sale sin tener el navegador abierto.

## Qué está probado y qué no
- Probado (`npm test`, 57 comprobaciones, más una prueba de navegador): OAuth con `state`, cifrado de tokens, publicación de imagen/reel/carrusel, PNG→JPEG, scheduler por HTTP, historial, borrado, errores, desconexión — contra un **Meta simulado** y Postgres en memoria (PGlite).
- **Sin probar contra servicios reales:** Instagram/Meta, Neon (driver serverless) y los límites de Vercel. Puntos a vigilar:
  - **Relé de medios** (`/api/media`): se emite en streaming. Los límites de tamaño/tiempo de respuesta de las funciones de Vercel dependen del plan; prueba primero con una imagen y luego con un reel.
  - `maxDuration` en `vercel.json` (60 s) debe estar permitido por tu plan.
  - Los reels que Meta tarda en procesar quedan en «Publicando» y el scheduler los retoma.
- La sesión es una cookie firmada sin estado (12 h): cerrar sesión la borra en ese navegador, pero no la revoca en el servidor. `ADMIN_PASSWORD_HASH` (PHP) no está soportado aquí.
