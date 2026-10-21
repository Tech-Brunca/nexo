-- Nexo — tablas de UN colegio. Se ejecuta dentro del esquema del colegio (c_<id>):
-- la aplicación reemplaza __ESQUEMA__ por el nombre del esquema. Es idempotente.
CREATE SCHEMA IF NOT EXISTS __ESQUEMA__;

CREATE TABLE IF NOT EXISTS __ESQUEMA__.secciones (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  nivel text NOT NULL,
  nombre text NOT NULL,
  asignatura_id int REFERENCES general.asignaturas(id) ON DELETE SET NULL,
  nota_aprobatoria numeric(5,2),
  anio smallint NOT NULL
);
CREATE INDEX IF NOT EXISTS secciones_usuario ON __ESQUEMA__.secciones (usuario_id);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.estudiantes (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  cedula text NOT NULL,
  apellidos text NOT NULL,
  nombre text NOT NULL,
  fecha_nac date,
  genero char(1),
  encargado text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  extranjero smallint NOT NULL DEFAULT 0,
  activo smallint NOT NULL DEFAULT 1,
  UNIQUE (usuario_id, cedula)
);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.matriculas (
  id serial PRIMARY KEY,
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  subgrupo text NOT NULL DEFAULT '',
  UNIQUE (estudiante_id, seccion_id)
);
CREATE INDEX IF NOT EXISTS matriculas_seccion ON __ESQUEMA__.matriculas (seccion_id);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.periodos (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  numero smallint NOT NULL,
  nombre text NOT NULL,
  fecha_ini date,
  fecha_fin date,
  ponderado numeric(5,2) NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.lecciones (
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  periodo_id int NOT NULL REFERENCES __ESQUEMA__.periodos(id) ON DELETE CASCADE,
  cantidad int NOT NULL DEFAULT 0,
  PRIMARY KEY (seccion_id, periodo_id)
);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.componentes (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  nivel text NOT NULL,
  nombre text NOT NULL,
  porcentaje numeric(5,2) NOT NULL,
  tipo text NOT NULL DEFAULT 'puntos' CHECK (tipo IN ('puntos', 'indicadores', 'asistencia')),
  orden smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.evaluaciones (
  id serial PRIMARY KEY,
  componente_id int NOT NULL REFERENCES __ESQUEMA__.componentes(id) ON DELETE CASCADE,
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  periodo_id int NOT NULL REFERENCES __ESQUEMA__.periodos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  puntos_total numeric(6,2) NOT NULL DEFAULT 0,
  porcentaje numeric(5,2) NOT NULL,
  fecha date
);
CREATE INDEX IF NOT EXISTS evaluaciones_seccion ON __ESQUEMA__.evaluaciones (seccion_id, periodo_id);

-- Por evaluación y estudiante: puntos (evaluaciones por puntos), "no entregó" y observación
CREATE TABLE IF NOT EXISTS __ESQUEMA__.notas (
  evaluacion_id int NOT NULL REFERENCES __ESQUEMA__.evaluaciones(id) ON DELETE CASCADE,
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  puntos numeric(6,2),
  no_entrego boolean NOT NULL DEFAULT false,
  observacion text NOT NULL DEFAULT '',
  PRIMARY KEY (evaluacion_id, estudiante_id)
);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.evaluacion_indicadores (
  evaluacion_id int NOT NULL REFERENCES __ESQUEMA__.evaluaciones(id) ON DELETE CASCADE,
  indicador_id int NOT NULL REFERENCES general.indicadores(id) ON DELETE CASCADE,
  PRIMARY KEY (evaluacion_id, indicador_id)
);

-- nivel: NULL = no se califica (no cuenta), 0 = no entregó, 1, 2, 3
CREATE TABLE IF NOT EXISTS __ESQUEMA__.valoraciones (
  evaluacion_id int NOT NULL REFERENCES __ESQUEMA__.evaluaciones(id) ON DELETE CASCADE,
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  indicador_id int NOT NULL REFERENCES general.indicadores(id) ON DELETE CASCADE,
  nivel smallint CHECK (nivel BETWEEN 0 AND 3),
  PRIMARY KEY (evaluacion_id, estudiante_id, indicador_id)
);

-- tipo: AI ausencia injustificada, AJ justificada, TI tardía injustificada, TJ tardía justificada
CREATE TABLE IF NOT EXISTS __ESQUEMA__.asistencia (
  id serial PRIMARY KEY,
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('AI', 'AJ', 'TI', 'TJ')),
  lecciones smallint NOT NULL DEFAULT 1,
  observacion text NOT NULL DEFAULT '',
  UNIQUE (estudiante_id, seccion_id, fecha)
);
CREATE INDEX IF NOT EXISTS asistencia_seccion ON __ESQUEMA__.asistencia (seccion_id, fecha);

CREATE TABLE IF NOT EXISTS __ESQUEMA__.convocatorias (
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  nota1 numeric(5,2),
  nota2 numeric(5,2),
  PRIMARY KEY (estudiante_id, seccion_id)
);

-- Bitácora de comunicados enviados por WhatsApp
CREATE TABLE IF NOT EXISTS __ESQUEMA__.comunicados (
  id serial PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES general.usuarios(id) ON DELETE CASCADE,
  estudiante_id int REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  referencia text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  mensaje text NOT NULL,
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comunicados_usuario ON __ESQUEMA__.comunicados (usuario_id, creado);

-- v3.1: componentes fijos del SEA (clave) y calificaciones importadas
ALTER TABLE __ESQUEMA__.componentes ADD COLUMN IF NOT EXISTS clave text
  CHECK (clave IN ('tc', 'tareas', 'prueba', 'proyecto', 'asistencia'));
CREATE UNIQUE INDEX IF NOT EXISTS componentes_clave ON __ESQUEMA__.componentes (usuario_id, nivel, clave) WHERE clave IS NOT NULL;

-- Valor obtenido (en puntos del porcentaje) que reemplaza lo calculado para un componente,
-- p. ej. al traer el I periodo desde ReDDi o desde el SEA.
CREATE TABLE IF NOT EXISTS __ESQUEMA__.notas_importadas (
  estudiante_id int NOT NULL REFERENCES __ESQUEMA__.estudiantes(id) ON DELETE CASCADE,
  seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
  periodo_id int NOT NULL REFERENCES __ESQUEMA__.periodos(id) ON DELETE CASCADE,
  clave text NOT NULL,
  valor numeric(6,2) NOT NULL,
  creado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estudiante_id, seccion_id, periodo_id, clave)
);

-- v3.2: subgrupo de la sección (medio grupo de taller en 7.° a 9.°); NULL = sin subgrupo
ALTER TABLE __ESQUEMA__.secciones ADD COLUMN IF NOT EXISTS subgrupo text CHECK (subgrupo IN ('A', 'B'));
-- Sin duplicados exactos (misma sección, asignatura, año y subgrupo). Si un colegio ya tiene
-- duplicados, el índice no se crea ahí y la app sigue validando al crear o editar.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS secciones_unica ON __ESQUEMA__.secciones
    (usuario_id, nivel, nombre, COALESCE(asignatura_id, 0), anio, COALESCE(subgrupo, ''));
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- v3.3: lecciones impartidas cada día (se registran al guardar la asistencia). Su suma da las
-- lecciones efectivas; una fila en {S}.lecciones (por sección y periodo) es el ajuste manual del docente.
-- Antes cantidad = 0 en {S}.lecciones significaba "sin registrar": se limpia una sola vez, al crear la tabla nueva.
DO $$ BEGIN
  IF to_regclass('__ESQUEMA__.lecciones_dia') IS NULL THEN
    CREATE TABLE __ESQUEMA__.lecciones_dia (
      seccion_id int NOT NULL REFERENCES __ESQUEMA__.secciones(id) ON DELETE CASCADE,
      fecha date NOT NULL,
      cantidad smallint NOT NULL CHECK (cantidad >= 0),
      PRIMARY KEY (seccion_id, fecha)
    );
    DELETE FROM __ESQUEMA__.lecciones WHERE cantidad = 0;
  END IF;
END $$;

-- v3.4: el ajuste manual pasa a ser una corrección (ajuste) que se suma a las lecciones de cada día,
-- así el total sigue creciendo al registrar días nuevos. Se convierte una sola vez el total fijo anterior
-- (cantidad) en corrección; la columna cantidad queda sin uso.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = '__ESQUEMA__' AND table_name = 'lecciones' AND column_name = 'ajuste') THEN
    ALTER TABLE __ESQUEMA__.lecciones ADD COLUMN ajuste int NOT NULL DEFAULT 0;
    UPDATE __ESQUEMA__.lecciones l SET ajuste = l.cantidad - COALESCE((
      SELECT SUM(d.cantidad) FROM __ESQUEMA__.lecciones_dia d JOIN __ESQUEMA__.periodos p ON p.id = l.periodo_id
      WHERE d.seccion_id = l.seccion_id AND (p.fecha_ini IS NULL OR d.fecha >= p.fecha_ini) AND (p.fecha_fin IS NULL OR d.fecha <= p.fecha_fin)), 0);
  END IF;
END $$;
