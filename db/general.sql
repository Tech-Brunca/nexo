-- Nexo — esquema "general" (compartido): cuentas, colegios y lo que es de cada docente
-- en todos sus colegios. Es idempotente: se puede ejecutar varias veces.
CREATE SCHEMA IF NOT EXISTS general;

CREATE TABLE IF NOT EXISTS general.meta (
  clave text PRIMARY KEY,
  valor text NOT NULL
);

CREATE TABLE IF NOT EXISTS general.usuarios (
  id serial PRIMARY KEY,
  correo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  cedula text NOT NULL DEFAULT '',
  pass_hash text NOT NULL,
  rol text NOT NULL DEFAULT 'docente' CHECK (rol IN ('admin', 'docente')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activo', 'bloqueado')),
  nota_registro text NOT NULL DEFAULT '',
  creado timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso timestamptz
);

-- Cada colegio vive en su propio esquema de Postgres (c_<id>)
CREATE TABLE IF NOT EXISTS general.colegios (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  codigo text NOT NULL DEFAULT '',
  direccion_regional text NOT NULL DEFAULT '',
  circuito text NOT NULL DEFAULT '',
  director text NOT NULL DEFAULT '',
  esquema text UNIQUE,
  creado_por int REFERENCES general.usuarios(id) ON DELETE SET NULL,
  creado timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS general.usuario_colegios (
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  colegio_id int NOT NULL REFERENCES general.colegios(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, colegio_id)
);

CREATE TABLE IF NOT EXISTS general.ajustes (
  usuario_id int PRIMARY KEY REFERENCES general.usuarios(id) ON DELETE CASCADE,
  curso_lectivo smallint NOT NULL DEFAULT 2026,
  nota_aprobatoria numeric(5,2) NOT NULL DEFAULT 70,
  tardias_por_ausencia smallint NOT NULL DEFAULT 2,
  alerta_dias smallint NOT NULL DEFAULT 15,
  alerta_ausencias smallint NOT NULL DEFAULT 3,
  ne_cuenta_cero boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS general.escala_asistencia (
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  desde numeric(5,2) NOT NULL,
  hasta numeric(5,2) NOT NULL,
  porcentaje numeric(5,2) NOT NULL,
  PRIMARY KEY (usuario_id, desde)
);

CREATE TABLE IF NOT EXISTS general.asignaturas (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  nombre text NOT NULL
);

-- Indicadores de cada docente; sirven en todos sus colegios
CREATE TABLE IF NOT EXISTS general.indicadores (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  asignatura_id int REFERENCES general.asignaturas(id) ON DELETE SET NULL,
  nivel text NOT NULL,
  periodo_numero smallint,
  nombre text NOT NULL,
  inicial text NOT NULL DEFAULT '',
  intermedio text NOT NULL DEFAULT '',
  avanzado text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS indicadores_usuario ON general.indicadores (usuario_id, nivel);

-- Plantillas de comunicados por WhatsApp de cada docente
CREATE TABLE IF NOT EXISTS general.plantillas (
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  texto text NOT NULL,
  PRIMARY KEY (usuario_id, tipo)
);
