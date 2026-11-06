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

-- v3.8: escudo o logo de cada colegio (aparte, para no cargar la imagen en cada consulta del colegio)
CREATE TABLE IF NOT EXISTS general.colegio_logos (
  colegio_id int PRIMARY KEY REFERENCES general.colegios(id) ON DELETE CASCADE,
  imagen bytea NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('image/png', 'image/jpeg', 'image/webp')),
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- v3.9: plantillas de «comunicado al hogar» de cada docente (se crean las predeterminadas la primera vez)
CREATE TABLE IF NOT EXISTS general.plantillas_hogar (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  texto text NOT NULL,
  orden smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS plantillas_hogar_usuario ON general.plantillas_hogar (usuario_id, orden);

-- v3.11: matriz de componentes del MEP (Reglamento de Evaluación), por año; la administran los administradores
CREATE TABLE IF NOT EXISTS general.reac_reglas (
  anio smallint NOT NULL,
  codigo text NOT NULL,          -- artículo e inciso, p. ej. «42h»
  ciclo text NOT NULL,           -- primaria, iii, diversificada, adultos, vocacional, coned-distancia, coned-virtual
  nombre text NOT NULL,
  articulo text NOT NULL DEFAULT '',
  aprobatoria numeric(5,2) NOT NULL DEFAULT 70,
  diagnostico boolean NOT NULL DEFAULT false,
  nota text,
  componentes jsonb NOT NULL,    -- [{clave, nombre, pct, cantidad?}]
  orden int NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, codigo)
);
-- Regla del MEP de cada materia y forma de calificar el trabajo cotidiano
ALTER TABLE general.asignaturas ADD COLUMN IF NOT EXISTS ciclo text;
ALTER TABLE general.asignaturas ADD COLUMN IF NOT EXISTS regla text;
ALTER TABLE general.asignaturas ADD COLUMN IF NOT EXISTS tc_modo text NOT NULL DEFAULT 'indicadores' CHECK (tc_modo IN ('indicadores', 'unica'));
-- La escala de asistencia que venía de fábrica (reglamento anterior) pasa a la del artículo 37 del REAC 2026.
-- Solo para quienes la tienen tal cual vino; una escala modificada por el docente no se toca.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM general.meta WHERE clave = 'escala_reac_2026') THEN
    DELETE FROM general.escala_asistencia e WHERE e.usuario_id IN (
      SELECT usuario_id FROM general.escala_asistencia GROUP BY usuario_id
      HAVING string_agg(desde::int || '-' || hasta::int || ':' || porcentaje::int, ',' ORDER BY desde)
        = '0-1:100,1-10:90,10-20:80,20-30:70,30-40:60,40-50:50,50-60:40,60-70:30,70-80:20,80-90:10,90-101:0');
    INSERT INTO general.meta VALUES ('escala_reac_2026', '1') ON CONFLICT DO NOTHING;
  END IF;
END $$;
