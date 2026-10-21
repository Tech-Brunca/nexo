# Nexo

Registro digital docente multiusuario y multicolegio: asistencia, evaluaciones por puntos e
indicadores, calificaciones por periodo, nota anual con convocatorias, alerta temprana, informes
para imprimir y comunicados por WhatsApp. Astro + PostgreSQL (Supabase en línea, Docker en la PC).
Se diseñó a partir del análisis funcional de ReDDi.exe hecho con REA (ver `ANALISIS-REDDI.md`);
el código y el esquema son propios.

## Arquitectura

```
Base de datos (un proyecto de Supabase o un Postgres en Docker)
├── general   → usuarios, colegios, membresías, y lo que cada docente usa en todos sus colegios:
│               asignaturas, indicadores, ajustes, escala de asistencia, mensajes de WhatsApp
├── c_1       → un colegio: secciones, estudiantes, periodos, componentes, evaluaciones,
│               notas, indicadores calificados, asistencia, convocatorias, comunicados
├── c_2       → otro colegio, con sus propias tablas
└── …
```

- Cada colegio es un **esquema** propio (como una base de datos aparte dentro del mismo proyecto).
  Lo crea un administrador en *Administración → Colegios*; Nexo arma sus tablas solo.
- El docente inicia sesión y elige el colegio; todas las consultas de esa sesión van solo al
  esquema de ese colegio. *Cambiar de colegio* lo lleva al otro.
- Dentro de un colegio, cada docente ve únicamente sus propios grupos, estudiantes y notas.
- Las cuentas nuevas quedan pendientes hasta que un administrador las aprueba. Los correos de
  `ADMIN_EMAILS` entran como administradores sin aprobación.
- Al subir una versión que cambia las tablas, la primera visita actualiza el esquema general y el de
  todos los colegios (también se puede correr `npm run db:migrar`).

## En la PC (WSL + Docker Desktop)

```
cd ~/proyectos/nexo
docker compose up -d --build
```

Abra http://localhost:8090, solicite acceso con el correo de `ADMIN_EMAILS`, cree un colegio en
*Administración → Colegios* y agréguelo en *Mi cuenta*.

Archivo `.env` opcional junto a `docker-compose.yml`:

```
ADMIN_EMAILS=hferreto@gmail.com,otro.admin@correo.com
SESSION_SECRET=una-frase-larga-y-secreta
DB_PASSWORD=otra-clave
```

## En línea: Supabase + Netlify

### 1. Base de datos (Supabase)

1. Cree un proyecto en https://supabase.com (región cercana, p. ej. us-east-1) y anote la contraseña.
2. *Connect* → copie la cadena del **Transaction pooler** (puerto 6543):
   `postgresql://postgres.xxxx:CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
3. No hace falta crear tablas: Nexo las crea en la primera visita. (Si prefiere hacerlo antes:
   ponga `DATABASE_URL` y `DB_SSL=true` en un `.env` y ejecute `npm install && npm run db:migrar`.)

### 2. Sitio (Netlify)

1. *Add new site → Import from Git* → repositorio `nexo`. Netlify toma `netlify.toml` solo.
2. *Site configuration → Environment variables*:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la cadena del Transaction pooler de Supabase |
   | `DB_SSL` | `true` |
   | `DB_POOL` | `2` |
   | `ADMIN_EMAILS` | su correo (y el de otros administradores, separados por coma) |
   | `SESSION_SECRET` | una frase larga y aleatoria |

3. *Deploy*. Cada `git push` a `main` vuelve a publicar.

> El plan gratis de Supabase pausa el proyecto tras una semana sin uso; se reactiva desde el panel.

## Calificación

- **Por puntos**: `puntos / puntos totales × valor %`. «No entregó» vale 0.
- **Por indicadores (estilo Moodle)**: cada indicador se califica 1, 2 o 3; «no se califica» no cuenta.
  El valor de la evaluación se reparte en partes iguales entre los indicadores calificados:
  `promedio(nivel / 3) × valor %`. «No entregó» cuenta como 0 o no se toma en cuenta (en *Ajustes*).
- **Calificación masiva**: marque varios estudiantes (casillas, Shift+clic o arrastrando) y aplique
  la misma nota o nivel.
- Cada componente se topa en su porcentaje. Asistencia: ausencias injustificadas + tardías
  convertidas, sobre las lecciones impartidas → escala del MEP (0% a menos de 1% → 10; 1% a menos de 10% → 9;
  … 90% a 100% → 0, para un componente de 10%), proporcional al valor del componente y editable en *Ajustes*.
- Nota anual: suma de `nota del periodo × ponderado`; bajo la mínima → *Aplazado*; convocatorias I y II.

## SEA

- Los componentes son fijos y coinciden con las columnas de la plantilla del SEA: Trabajo cotidiano, Tareas,
  Prueba, Proyecto y Asistencia. Cada docente ajusta solo el porcentaje (y si se califica por puntos o indicadores).
- *Importar / exportar SEA*: por sección y periodo. Exporta el CSV con las columnas de la plantilla
  (`"Id";"Nombre";…`, separado por punto y coma, UTF-8). Importa el mismo formato (desde ReDDi o el SEA):
  verifica que las columnas sean exactamente esas, crea los estudiantes que falten, los matricula y guarda las
  calificaciones como *importadas* (reemplazan lo calculado en ese componente; se pueden quitar).

## Informes

Lista de estudiantes · Resumen de asistencia · Detalle de asistencia · Alerta de ausentismo ·
Calificaciones del grupo · Calificaciones por estudiante · Indicadores calificados · Informe anual ·
Acta de aplazados y convocatorias · Eximidos del II periodo (I periodo > 90 y todas las notas del II > 90). Con encabezado del MEP, para imprimir/guardar en PDF o Excel (CSV).

## Comunicados por WhatsApp

Desde *Asistencia* (ausencias y tardías del día), cada evaluación (quienes no entregaron),
*Alerta temprana* y *Comunicados* (mensaje a todo un grupo). Nexo abre WhatsApp con el mensaje
listo al encargado; el docente lo revisa y presiona Enviar desde su número. «Enviar uno tras otro»
recorre la lista. Las plantillas se editan en *Mensajes WhatsApp* y queda una bitácora por colegio.

## Datos personales

Nexo guarda datos de estudiantes menores de edad. Mantenga el repositorio privado, no suba respaldos
ni listas reales al repositorio, use contraseñas propias por docente y consulte las disposiciones de
su institución sobre el uso de servicios externos para estos datos.

## Desarrollo sin Docker

Node 22+ y un PostgreSQL 15+:

```
npm install
DB_HOST=127.0.0.1 DB_USER=nexo DB_PASSWORD=nexo123 DB_NAME=nexo ADMIN_EMAILS=su@correo npm run dev
```
