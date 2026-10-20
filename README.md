# Nexo

Registro digital docente multiusuario: asistencia, evaluaciones, indicadores,
calificaciones por periodo, nota anual con convocatorias y alerta temprana de
ausentismo. Astro + MySQL (MariaDB en Docker, TiDB Cloud en línea, Netlify para publicar).
Se diseñó a partir del análisis funcional de ReDDi.exe hecho con REA (ver `ANALISIS-REDDI.md`);
el código y el esquema son propios.

## Cómo se organiza

- **Usuarios**: cada docente solicita acceso en `/registro`; un administrador lo aprueba en
  *Administración → Usuarios*. Los correos listados en `ADMIN_EMAILS` entran como administradores
  sin aprobación.
- **Instituciones**: catálogo compartido. Cada docente agrega las suyas en *Mi cuenta* y cambia
  la institución activa desde el menú.
- **Datos de cada docente** (nadie más los ve, tampoco los administradores):
  - por institución: secciones (grupos completos o medios grupos), estudiantes, periodos, componentes;
  - en todas sus instituciones: asignaturas, indicadores, reglas y escala de asistencia (*Ajustes*).

## En la PC (WSL + Docker Desktop)

```
cd ~/proyectos/nexo
docker compose up -d --build
```

Abra http://localhost:8090 y cree su cuenta en *Solicitar acceso* con el correo de `ADMIN_EMAILS`
(por defecto hferreto@gmail.com; cámbielo en un archivo `.env`).

> Si venía de la versión 1 (clave única), la base cambió: `docker compose down -v` y luego `up -d --build`.

Archivo `.env` opcional junto a `docker-compose.yml`:

```
ADMIN_EMAILS=hferreto@gmail.com,otro.admin@correo.com
SESSION_SECRET=una-frase-larga-y-secreta
DB_PASSWORD=otra-clave
DB_ROOT_PASSWORD=otra-clave-mas
```

## En línea: TiDB Cloud + Netlify

### 1. Base de datos (TiDB Cloud Starter, compatible con MySQL)

1. Cree una cuenta en https://tidbcloud.com y una instancia **Starter** (elija la región más cercana, p. ej. en EE. UU.).
2. En *Connect* anote host, puerto (4000), usuario (lleva un prefijo, p. ej. `xxxx.root`) y genere la contraseña.
3. Cree la base `reddi` (en el *SQL Editor*: `CREATE DATABASE reddi;`).
4. Desde el WSL, cree las tablas con un `.env` temporal:

   ```
   DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
   DB_PORT=4000
   DB_USER=xxxx.root
   DB_PASSWORD=...
   DB_NAME=reddi
   DB_SSL=true
   ```

   ```
   npm install
   npm run db:init
   ```

   Borre ese `.env` (o deje solo lo de Docker): **nunca lo suba a GitHub**.

### 2. Sitio (Netlify)

1. *Add new site → Import from Git* → repositorio `nexo`. Netlify toma `netlify.toml` solo.
2. *Site configuration → Environment variables*:

   | Variable | Valor |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | los de TiDB |
   | `DB_SSL` | `true` |
   | `DB_POOL` | `2` |
   | `ADMIN_EMAILS` | su correo |
   | `SESSION_SECRET` | una frase larga y aleatoria |

3. *Deploy*. Cada `git push` a `main` vuelve a publicar.

## Reglas de cálculo

- Evaluación por puntos: `puntos obtenidos / puntos totales × valor %`.
- Evaluación por indicadores: `suma de niveles / (3 × indicadores calificados) × valor %`.
  *Sin calificar* no cuenta; *Sin entregar* vale 0.
- Cada componente se topa en su porcentaje.
- Asistencia: ausencias injustificadas + (tardías injustificadas ÷ tardías por ausencia), sobre las
  lecciones efectivas del periodo → escala editable en *Ajustes*.
  **Revise que la escala coincida con el Reglamento de Evaluación vigente.**
- Nota anual: suma de `nota del periodo × ponderado`. Bajo la mínima → *Aplazado*; aprueba si alguna
  convocatoria alcanza la mínima; *Reprobado* si la 2.ª convocatoria no.

## Datos personales

La app guarda datos de estudiantes menores de edad. Mantenga el repositorio privado, no suba
respaldos ni listas reales al repositorio, use contraseñas propias por docente y consulte las
disposiciones de su institución sobre el uso de servicios externos para estos datos.

## Desarrollo sin Docker

Node 22+ y una MariaDB/MySQL con el esquema cargado (`npm run db:init`):

```
npm install
DB_HOST=127.0.0.1 ADMIN_EMAILS=su@correo npm run dev
```
