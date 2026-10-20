-- ReDDi Web v2 — esquema multiusuario (MySQL / MariaDB / TiDB)
-- Cada docente es dueño de sus datos. Las instituciones son un catálogo compartido.
SET NAMES utf8mb4;

-- ── Cuentas e instituciones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  correo VARCHAR(160) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  cedula VARCHAR(30) DEFAULT '',
  pass_hash VARCHAR(200) NOT NULL,
  rol ENUM('admin','docente') NOT NULL DEFAULT 'docente',
  estado ENUM('pendiente','activo','bloqueado') NOT NULL DEFAULT 'pendiente',
  nota_registro VARCHAR(300) DEFAULT '',
  creado DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso DATETIME NULL,
  UNIQUE KEY (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS instituciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  codigo VARCHAR(30) DEFAULT '',
  direccion_regional VARCHAR(120) DEFAULT '',
  circuito VARCHAR(10) DEFAULT '',
  director VARCHAR(120) DEFAULT '',
  creado_por INT NULL,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuario_instituciones (
  usuario_id INT NOT NULL,
  institucion_id INT NOT NULL,
  PRIMARY KEY (usuario_id, institucion_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reglas propias de cada docente
CREATE TABLE IF NOT EXISTS ajustes (
  usuario_id INT PRIMARY KEY,
  curso_lectivo SMALLINT DEFAULT 2026,
  nota_aprobatoria DECIMAL(5,2) DEFAULT 70,
  tardias_por_ausencia TINYINT DEFAULT 2,
  alerta_dias TINYINT DEFAULT 15,
  alerta_ausencias TINYINT DEFAULT 3,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- % de ausencias injustificadas -> % del valor del componente de asistencia (editable por docente)
CREATE TABLE IF NOT EXISTS escala_asistencia (
  usuario_id INT NOT NULL,
  desde DECIMAL(5,2) NOT NULL,
  hasta DECIMAL(5,2) NOT NULL,
  porcentaje DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (usuario_id, desde),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Datos del docente ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asignaturas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS secciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  institucion_id INT NOT NULL,
  nivel VARCHAR(10) NOT NULL,
  nombre VARCHAR(20) NOT NULL,
  asignatura_id INT NULL,
  nota_aprobatoria DECIMAL(5,2) NULL,
  anio SMALLINT NOT NULL,
  KEY (usuario_id, institucion_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE,
  FOREIGN KEY (asignatura_id) REFERENCES asignaturas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lista de estudiantes de cada docente en cada institución
CREATE TABLE IF NOT EXISTS estudiantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  institucion_id INT NOT NULL,
  cedula VARCHAR(30) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  fecha_nac DATE NULL,
  genero CHAR(1) NULL,
  encargado VARCHAR(150) DEFAULT '',
  telefono VARCHAR(30) DEFAULT '',
  extranjero TINYINT(1) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  UNIQUE KEY (usuario_id, institucion_id, cedula),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matriculas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  estudiante_id INT NOT NULL,
  seccion_id INT NOT NULL,
  subgrupo VARCHAR(5) DEFAULT '',
  UNIQUE KEY (estudiante_id, seccion_id),
  FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
  FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Periodos de cada docente en cada institución
CREATE TABLE IF NOT EXISTS periodos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  institucion_id INT NOT NULL,
  numero TINYINT NOT NULL,
  nombre VARCHAR(40) NOT NULL,
  fecha_ini DATE NULL,
  fecha_fin DATE NULL,
  ponderado DECIMAL(5,2) NOT NULL DEFAULT 50,
  KEY (usuario_id, institucion_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lecciones (
  seccion_id INT NOT NULL,
  periodo_id INT NOT NULL,
  cantidad INT NOT NULL DEFAULT 0,
  PRIMARY KEY (seccion_id, periodo_id),
  FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Componentes de evaluación de cada docente, por institución y nivel
CREATE TABLE IF NOT EXISTS componentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  institucion_id INT NOT NULL,
  nivel VARCHAR(10) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  porcentaje DECIMAL(5,2) NOT NULL,
  tipo ENUM('puntos','indicadores','asistencia') NOT NULL DEFAULT 'puntos',
  orden TINYINT DEFAULT 0,
  KEY (usuario_id, institucion_id, nivel),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  componente_id INT NOT NULL,
  seccion_id INT NOT NULL,
  periodo_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  puntos_total DECIMAL(6,2) NOT NULL DEFAULT 0,
  porcentaje DECIMAL(5,2) NOT NULL,
  fecha DATE NULL,
  FOREIGN KEY (componente_id) REFERENCES componentes(id) ON DELETE CASCADE,
  FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notas (
  evaluacion_id INT NOT NULL,
  estudiante_id INT NOT NULL,
  puntos DECIMAL(6,2) NULL,
  observacion VARCHAR(200) DEFAULT '',
  PRIMARY KEY (evaluacion_id, estudiante_id),
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indicadores propios de cada docente (sirven en todas sus instituciones)
CREATE TABLE IF NOT EXISTS indicadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  asignatura_id INT NULL,
  nivel VARCHAR(10) NOT NULL,
  periodo_numero TINYINT NULL,
  nombre VARCHAR(500) NOT NULL,
  inicial VARCHAR(500) DEFAULT '',
  intermedio VARCHAR(500) DEFAULT '',
  avanzado VARCHAR(500) DEFAULT '',
  KEY (usuario_id, nivel),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (asignatura_id) REFERENCES asignaturas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluacion_indicadores (
  evaluacion_id INT NOT NULL,
  indicador_id INT NOT NULL,
  PRIMARY KEY (evaluacion_id, indicador_id),
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- nivel: NULL = sin calificar (no cuenta), 0 = sin entregar, 1 inicial, 2 intermedio, 3 avanzado
CREATE TABLE IF NOT EXISTS valoraciones (
  evaluacion_id INT NOT NULL,
  estudiante_id INT NOT NULL,
  indicador_id INT NOT NULL,
  nivel TINYINT NULL,
  PRIMARY KEY (evaluacion_id, estudiante_id, indicador_id),
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- tipo: AI ausencia injustificada, AJ justificada, TI tardía injustificada, TJ tardía justificada
CREATE TABLE IF NOT EXISTS asistencia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  estudiante_id INT NOT NULL,
  seccion_id INT NOT NULL,
  fecha DATE NOT NULL,
  tipo ENUM('AI','AJ','TI','TJ') NOT NULL,
  lecciones TINYINT NOT NULL DEFAULT 1,
  observacion VARCHAR(200) DEFAULT '',
  UNIQUE KEY (estudiante_id, seccion_id, fecha),
  FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
  FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS convocatorias (
  estudiante_id INT NOT NULL,
  seccion_id INT NOT NULL,
  nota1 DECIMAL(5,2) NULL,
  nota2 DECIMAL(5,2) NULL,
  PRIMARY KEY (estudiante_id, seccion_id),
  FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
  FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
