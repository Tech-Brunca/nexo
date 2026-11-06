// Matriz de componentes de la calificación del Reglamento de Evaluación de los Aprendizajes (REAC),
// Decreto Ejecutivo N.° 45509-MEP, versión de febrero de 2026, artículos 40 a 46.
// Es la semilla del año 2026: cada año se puede copiar y ajustar desde Administración → Componentes del MEP.
import { q, one, exec, transaccion, preparar, esquemaActual } from './db';
import { SEA, type ClaveSea } from './sea';
import { getAjustes } from './db';

export type CompRegla = { clave: ClaveSea; nombre: string; pct: number; cantidad?: number };
export type Regla = { codigo: string; ciclo: string; nombre: string; articulo: string; aprobatoria: number; diagnostico?: boolean; nota?: string; componentes: CompRegla[] };

export const CICLOS: [string, string][] = [
  ['primaria', 'I y II Ciclos (primaria) y Escuelas Nocturnas'],
  ['iii', 'III Ciclo (7.°, 8.° y 9.°), académico y técnico'],
  ['diversificada', 'Educación Diversificada (10.°, 11.° y 12.°), incluye subáreas técnicas'],
  ['adultos', 'Educación de Personas Jóvenes y Adultas (CINDEA e IPEC)'],
  ['vocacional', 'III Ciclo y Ciclo Diversificado Vocacional'],
  ['coned-distancia', 'CONED o EPJA a distancia'],
  ['coned-virtual', 'CONED o EPJA virtual'],
];

// Notación corta: tc=Trabajo cotidiano, ta=Tareas, pr=Pruebas, py=Proyecto, pf=Portafolio de evidencias,
// ie=Instrumento de evaluación sumativa, as=Asistencia. El número tras «:» es el porcentaje; tras «x», cuántas.
const NOMBRES: Record<string, [ClaveSea, string]> = {
  tc: ['tc', 'Trabajo cotidiano'], ta: ['tareas', 'Tareas'], pr: ['prueba', 'Pruebas'], py: ['proyecto', 'Proyecto'],
  pf: ['proyecto', 'Portafolio de evidencias'], ie: ['prueba', 'Instrumento de evaluación sumativa'], as: ['asistencia', 'Asistencia'],
};
const c = (s: string): CompRegla[] => s.split(' ').map((t) => {
  const m = /^([a-z]{2}):(\d+)(?:x(\d+))?$/.exec(t)!;
  const [clave, nombre] = NOMBRES[m[1]];
  return { clave, nombre, pct: Number(m[2]), ...(m[3] ? { cantidad: Number(m[3]) } : {}) };
});
const DIAG = 'tc:0 ta:0 as:0';
const r = (ciclo: string, codigo: string, articulo: string, nombre: string, comps: string, aprobatoria: number, extra: Partial<Regla> = {}): Regla =>
  ({ codigo, ciclo, articulo, nombre, aprobatoria, componentes: c(comps), ...(comps === DIAG ? { diagnostico: true } : {}), ...extra });

export const REAC_2026: Regla[] = [
  // Artículo 40: I y II Ciclos, y 1.°–4.° niveles de Escuelas Nocturnas
  r('primaria', '40a', '40 a', 'Matemática, Estudios Sociales y Cívica, Ciencias, Español, Lengua Extranjera, Español como segunda lengua', 'tc:50 ta:10 pr:35x2 as:5', 65),
  r('primaria', '40b', '40 b', 'Educación Musical, Educación Física, Educación para el Hogar, Artes Industriales', 'tc:60 ta:10 pr:25x1 as:5', 65),
  r('primaria', '40c', '40 c', 'Educación Religiosa', 'tc:70 ta:25 as:5', 65),
  r('primaria', '40d', '40 d', 'Cultura Indígena y Lengua Indígena (diagnóstico y formativo)', DIAG, 65),
  r('primaria', '40e', '40 e', 'Conservatorios y centros de educación artística (especialidad)', 'tc:60 ta:10 pr:25x1 as:5', 65),
  r('primaria', '40f', '40 f', 'Formación Tecnológica', 'tc:65 ta:10 pr:20x1 as:5', 65),
  r('primaria', '40g', '40 g', 'Formación Tecnológica en aulas integradas de Audición y Lenguaje', 'tc:45 ta:20 py:30x1 as:5', 65),
  r('primaria', '40h', '40 h', 'Artes Plásticas', 'tc:60 ta:10 py:25x1 as:5', 65),
  // Artículo 41: III Ciclo
  r('iii', '41a', '41 a', 'Matemática, Español, Estudios Sociales, Ciencias, Lengua Extranjera', 'tc:45 ta:10 pr:40x2 as:5', 65),
  r('iii', '41b', '41 b', 'Cívica, Artes Plásticas, Hogar, Artes Industriales, Ed. Física, Ed. Musical, Psicología, Desarrollo Sociolaboral (nocturnos), Formación Tecnológica', 'tc:45 ta:10 py:40x1 as:5', 65),
  r('iii', '41c', '41 c', 'Asignaturas con valor agregado', 'tc:35 ta:10 py:20x1 pr:30x1 as:5', 65),
  r('iii', '41d', '41 d', 'Paz y Convivencia, Lengua y Cultura Indígena, Cosmovisión, Ed. Ambiental (indígenas), Artesanía y Música Indígena, Orientación (diagnóstico y formativo)', DIAG, 65),
  r('iii', '41e', '41 e', 'Educación Religiosa', 'tc:70 ta:25 as:5', 65),
  r('iii', '41f', '41 f', 'Talleres exploratorios, English on the Spot e Inglés Conversacional (CTP, colegios con orientación tecnológica, liceos experimentales bilingües)', 'tc:40 ta:10 pr:45x2 as:5', 65),
  r('iii', '41g', '41 g', 'Conservatorios (especialidad artística)', 'tc:55 ta:10 pr:30x2 as:5', 65),
  r('iii', '41h', '41 h', 'Centros de educación artística (especialidad)', 'tc:50 ta:5 pr:20x1 py:20x1 as:5', 65),
  r('iii', '41i', '41 i', 'Colegios ambientalistas (especialidad)', 'tc:40 py:20x1 ta:10 pr:25x1 as:5', 65),
  r('iii', '41j', '41 j', 'Colegios y secciones deportivas (especialidad)', 'tc:60 ta:10 pr:25x1 as:5', 65),
  r('iii', '41k', '41 k', 'Literatura en Lengua Inglesa (liceos y secciones bilingües)', 'tc:45 py:30x1 ta:20 as:5', 70),
  r('iii', '41l', '41 l', 'Reading and Writing, Listening and Speaking (liceos bilingües)', 'tc:40 pr:45x2 ta:10 as:5', 70),
  r('iii', '41m', '41 m', 'Inglés en secciones bilingües Español-Inglés', 'tc:40 pr:45x2 ta:10 as:5', 70),
  r('iii', '41n', '41 n', 'Inglés conversacional (colegios con orientación ambientalista)', 'tc:40 pr:45x2 ta:10 as:5', 65),
  r('iii', '41o', '41 o', 'Francés avanzado', 'tc:40 pr:45x2 ta:10 as:5', 65),
  r('iii', '41p', '41 p', 'Telesecundaria: Física y Química, Estudios Sociales de Costa Rica, Historia Universal, Geografía', 'tc:40 ta:10 pr:45x2 as:5', 65),
  r('iii', '41q', '41 q', 'Liceos rurales: Desarrollo Personal-Social y Proyecto Socio-productivo', 'tc:40 ta:10 py:45x1 as:5', 65),
  // Artículo 42: Educación Diversificada
  r('diversificada', '42a', '42 a', 'Matemática, Español, Estudios Sociales, Biología, Física, Química, Lengua Extranjera', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42b', '42 b', 'Educación Física, Educación Musical, Artes Plásticas', 'tc:45 ta:10 py:40x1 as:5', 70),
  r('diversificada', '42c', '42 c', 'Educación Cívica', 'tc:35 ta:10 pr:20x1 py:30x1 as:5', 70),
  r('diversificada', '42d', '42 d', 'Educación Religiosa', 'tc:70 ta:25 as:5', 70),
  r('diversificada', '42e', '42 e', 'Filosofía y Psicología', 'tc:45 py:40x1 ta:10 as:5', 70),
  r('diversificada', '42f', '42 f', 'Paz y Convivencia, Desarrollo de Talentos, Lengua y Cultura Indígena, Cosmovisión, Ed. Ambiental (indígenas), Orientación (diagnóstico y formativo)', DIAG, 70),
  r('diversificada', '42g', '42 g', 'Tecnologías en colegios académicos diurnos', 'tc:35 ta:10 pr:50x2 as:5', 70),
  r('diversificada', '42h', '42 h', 'Subáreas técnicas, CTP diurno', 'tc:25 ta:10 pr:45x2 py:15x1 as:5', 70),
  r('diversificada', '42i', '42 i', 'Subáreas técnicas, CTP nocturno, plan a dos años y rama técnica de EPJA', 'tc:30 ta:10 pr:45x2 py:10x1 as:5', 70),
  r('diversificada', '42j', '42 j', 'Reading and Writing, Listening and Speaking (liceos bilingües)', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42k', '42 k', 'Literatura en Lengua Inglesa (liceos y secciones bilingües)', 'tc:40 py:45x1 ta:10 as:5', 70),
  r('diversificada', '42l', '42 l', 'Inglés en secciones bilingües Español-Inglés', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42m', '42 m', 'Gestión Empresarial (liceos y secciones bilingües)', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42n', '42 n', 'Inglés conversacional especializado (orientación ambientalista)', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42o', '42 o', 'Francés (secciones bilingües y francés avanzado)', 'tc:35 pr:50x2 ta:10 as:5', 70),
  r('diversificada', '42p', '42 p', 'Conservatorios (especialidad artística)', 'tc:50 ta:10 pr:35x2 as:5', 70),
  r('diversificada', '42q', '42 q', 'Centros de educación artística (especialidad)', 'tc:40 ta:5 pr:20x1 py:30x1 as:5', 70),
  r('diversificada', '42r', '42 r', 'Colegios ambientalistas (especialidad)', 'tc:35 py:20x1 ta:10 pr:30x1 as:5', 70),
  r('diversificada', '42s', '42 s', 'Colegios y secciones deportivas (especialidad)', 'tc:40 ta:10 py:35x1 as:5', 70),
  r('diversificada', '42t', '42 t', 'Liceos rurales: Desarrollo Personal-Social y Proyecto Socio-productivo', 'tc:40 ta:10 py:45x1 as:5', 70),
  r('diversificada', '42u', '42 u', 'Desarrollo Humano (colegios académicos nocturnos)', 'tc:40 ta:10 pr:45x1 as:5', 70),
  r('diversificada', '42v', '42 v', 'Subáreas técnicas en modalidad dual', 'tc:25 pf:30x1 pr:40x2 as:5', 70),
  r('diversificada', '42w', '42 w', 'Formación Tecnológica (excepto colegios académicos nocturnos)', 'tc:55 ta:5 py:35x1 as:5', 70),
  // Artículo 43: CINDEA e IPEC
  r('adultos', '43a', '43 a', 'I Nivel, oferta convencional (excepto módulos opcionales)', 'tc:50 ta:10 pr:35x2 as:5', 65),
  r('adultos', '43b', '43 b', 'II Nivel, oferta convencional (excepto opcionales y Cívica)', 'tc:45 ta:10 pr:40x2 as:5', 65),
  r('adultos', '43c', '43 c', 'II Nivel: módulos de Educación Cívica y Formación Tecnológica', 'tc:45 ta:10 py:40x1 as:5', 65),
  r('adultos', '43d', '43 d', 'III Nivel, oferta convencional (excepto opcionales y Cívica)', 'tc:40 pr:45x2 ta:10 as:5', 70),
  r('adultos', '43e', '43 e', 'III Nivel: módulo de Educación Cívica', 'tc:35 ta:10 pr:20x1 py:30x1 as:5', 70),
  r('adultos', '43f', '43 f', 'Módulos opcionales (cualquier nivel)', 'tc:60 py:35x1 as:5', 70),
  r('adultos', '43g', '43 g', 'Módulos de fortalecimiento, Orientación y Paz y Convivencia (diagnóstico y formativo)', DIAG, 65),
  r('adultos', '43h', '43 h', 'III Nivel: Ética Profesional', 'tc:45 py:40x1 ta:10 as:5', 70),
  r('adultos', '43i', '43 i', 'Oferta emergente y cursos libres', 'tc:60 py:35x1 as:5', 70),
  // Artículo 44: III Ciclo y Ciclo Diversificado Vocacional
  r('vocacional', '44a', '44 a', 'Matemática, Ciencias, Español, Estudios Sociales, Lengua Extranjera', 'tc:55 ta:20 pr:20x1 as:5', 65),
  r('vocacional', '44b', '44 b', 'Educación Física, Educación Musical, Artes Plásticas', 'tc:55 ta:10 py:30x1 as:5', 65),
  r('vocacional', '44c', '44 c', 'Educación Religiosa', 'tc:70 ta:25 as:5', 65),
  r('vocacional', '44d', '44 d', 'III Ciclo: Técnica 1 y Técnica 2', 'tc:40 ta:15 py:20x1 pr:20x1 as:5', 65),
  r('vocacional', '44e', '44 e', 'Ciclo Diversificado Vocacional: Formación Vocacional y Tecnología', 'tc:60 ta:15 pr:20x1 as:5', 65),
  r('vocacional', '44f', '44 f', 'Formación Tecnológica (Informática Educativa)', 'tc:55 ta:5 py:35x1 as:5', 65),
  r('vocacional', '44g', '44 g', 'Ciclo Diversificado Vocacional: Tecnología', 'tc:60 ta:10 pr:25x1 as:5', 65),
  r('vocacional', '44h', '44 h', 'Paz y Convivencia, Habilidades y destrezas para la vida (diagnóstico y formativo)', DIAG, 65),
  // Artículo 45: CONED o EPJA a distancia
  r('coned-distancia', '45a', '45 a', 'III Ciclo: Matemática, Lengua Extranjera, Español, Estudios Sociales, Ciencias', 'pr:60x3 ta:40x3', 65),
  r('coned-distancia', '45b', '45 b', 'III Ciclo: Educación Cívica', 'ta:60x3 py:40x1', 65),
  r('coned-distancia', '45c', '45 c', 'III Ciclo: Técnico Básico', 'pr:70x2 ta:30x2', 70),
  r('coned-distancia', '45d', '45 d', 'Diversificada: Matemática, Lengua Extranjera, Español, Estudios Sociales, Biología', 'pr:70x3 ta:10x3', 70,
    { nota: 'El reglamento indica Pruebas 70 % y Tareas 10 % (suman 80 %). Revise el porcentaje con su comité de evaluación.' }),
  r('coned-distancia', '45e', '45 e', 'Diversificada: Educación Cívica', 'pr:30x1 ta:30x3 py:40x1', 70),
  r('coned-distancia', '45f', '45 f', 'Diversificada: Técnico Básico', 'pr:70x2 ta:30x2', 70),
  // Artículo 46: CONED o EPJA virtual
  r('coned-virtual', '46a', '46 a', 'III Ciclo: Matemática, Lengua Extranjera, Español, Estudios Sociales, Ciencias', 'tc:45 ta:20x2 ie:35x2', 65),
  r('coned-virtual', '46b', '46 b', 'III Ciclo: Educación Cívica', 'ta:15x2 tc:45 py:40x1', 65),
  r('coned-virtual', '46c', '46 c', 'III Ciclo: Técnico Básico', 'py:30x1 ie:40x2 ta:30x2', 70),
  r('coned-virtual', '46d', '46 d', 'Diversificada: Matemática, Lengua Extranjera, Español, Estudios Sociales, Biología', 'tc:40 ta:20x2 ie:40x2', 70),
  r('coned-virtual', '46e', '46 e', 'Diversificada: Educación Cívica', 'ta:10x2 tc:20 ie:30x2 py:40x1', 70),
  r('coned-virtual', '46f', '46 f', 'Diversificada: Técnico Básico', 'ta:30x2 ie:40x2 py:30x1', 70),
];

// ── Reglas guardadas por año (editables por el administrador) ────────────────
type Fila = { anio: number; codigo: string; ciclo: string; nombre: string; articulo: string; aprobatoria: number; diagnostico: boolean; nota: string | null; componentes: CompRegla[]; orden: number };
const aRegla = (f: Fila): Regla => ({ codigo: f.codigo, ciclo: f.ciclo, nombre: f.nombre, articulo: f.articulo, aprobatoria: Number(f.aprobatoria),
  diagnostico: f.diagnostico, nota: f.nota ?? undefined, componentes: f.componentes });

/** Inserta las reglas de 2026 la primera vez */
async function sembrar() {
  const hay = await one<any>('SELECT 1 FROM general.reac_reglas LIMIT 1');
  if (hay) return;
  for (const [i, x] of REAC_2026.entries())
    await exec(`INSERT INTO general.reac_reglas (anio, codigo, ciclo, nombre, articulo, aprobatoria, diagnostico, nota, componentes, orden)
      VALUES (2026,?,?,?,?,?,?,?,?::jsonb,?) ON CONFLICT DO NOTHING`, [x.codigo, x.ciclo, x.nombre, x.articulo, x.aprobatoria, !!x.diagnostico, x.nota ?? null, JSON.stringify(x.componentes), i + 1]);
}

export async function aniosReglas() {
  await sembrar();
  return (await q<any>('SELECT DISTINCT anio FROM general.reac_reglas ORDER BY anio')).map((r) => Number(r.anio));
}

/** Año de reglas que aplica a un curso lectivo: ese año, o el más reciente anterior (o el primero que haya) */
export async function anioVigente(curso: number) {
  const anios = await aniosReglas();
  return [...anios].reverse().find((a) => a <= curso) ?? anios[0] ?? 2026;
}

export async function reglasDe(anio: number): Promise<Regla[]> {
  await sembrar();
  return (await q<Fila>('SELECT * FROM general.reac_reglas WHERE anio=? ORDER BY orden, codigo', [anio])).map(aRegla);
}

export async function regla(anio: number, codigo: string | null | undefined): Promise<Regla | null> {
  if (!codigo) return null;
  await sembrar();
  const f = await one<Fila>('SELECT * FROM general.reac_reglas WHERE anio=? AND codigo=?', [anio, codigo]);
  return f ? aRegla(f) : null;
}

/** «Trabajo cotidiano 25 % · Tareas 10 % · Pruebas (2) 45 % …» */
export const resumenRegla = (x: Regla) => x.diagnostico ? 'Diagnóstico y formativo: trabajo cotidiano, tareas y asistencia, sin porcentaje'
  : x.componentes.map((k) => `${k.nombre}${k.cantidad && k.cantidad > 1 ? ` (${k.cantidad})` : ''} ${k.pct} %`).join(' · ');

/** Reparte un porcentaje en partes enteras: 45 en 2 → [22, 23]; si no es entero, en centésimas */
export function repartir(total: number, n: number): number[] {
  if (n <= 1) return [total];
  const entero = Number.isInteger(total);
  const unidad = entero ? 1 : 0.01;
  const base = Math.floor(total / n / unidad) * unidad;
  const partes = Array.from({ length: n }, () => Math.round(base * 100) / 100);
  partes[n - 1] = Math.round((total - base * (n - 1)) * 100) / 100;
  return partes;
}

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const SINGULAR: Record<string, string> = { Pruebas: 'Prueba', Tareas: 'Tarea', 'Instrumento de evaluación sumativa': 'Instrumento sumativo' };

/**
 * Componentes de una materia en un nivel según la regla del MEP: crea o actualiza los cinco (los que la regla no trae
 * quedan en 0 %). tc: 'indicadores' (varios instrumentos con indicadores) o 'unica' (una sola calificación).
 */
export async function aplicarRegla(uid: number, nivel: string, asignaturaId: number | null, x: Regla, tc: 'indicadores' | 'unica') {
  const esquema = esquemaActual();
  await transaccion(async (cx) => {
    const ex = async (sql: string, p: unknown[] = []) => (await cx.query(preparar(sql, esquema), p)).rows;
    for (const [i, s] of SEA.entries()) {
      const k = x.componentes.find((c) => c.clave === s.clave);
      const tipo = s.clave === 'asistencia' ? 'asistencia' : s.clave === 'tc' ? (tc === 'unica' ? 'puntos' : 'indicadores') : 'puntos';
      const nombre = k?.nombre ?? s.nombre;
      const pct = k?.pct ?? 0;
      const prueba1 = s.clave === 'prueba' && (k?.cantidad ?? 0) >= 2 ? repartir(pct, k!.cantidad!)[0] : null;
      const ya = (await ex('SELECT id FROM {S}.componentes WHERE usuario_id=? AND nivel=? AND COALESCE(asignatura_id,0)=? AND clave=?', [uid, nivel, asignaturaId ?? 0, s.clave]))[0];
      if (ya) await ex('UPDATE {S}.componentes SET nombre=?, porcentaje=?, tipo=?, orden=?, prueba1=COALESCE(prueba1, ?) WHERE id=?', [nombre, pct, tipo, i + 1, prueba1, ya.id]);
      else await ex(`INSERT INTO {S}.componentes (usuario_id, nivel, asignatura_id, nombre, porcentaje, tipo, orden, clave, prueba1) VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid, nivel, asignaturaId, nombre, pct, tipo, i + 1, s.clave, prueba1]);
    }
  });
}

/**
 * Crea en cada periodo las evaluaciones que pide la regla (pruebas, proyecto, tareas contadas, trabajo cotidiano
 * de nota única), repartiendo el porcentaje en enteros. Solo en componentes que aún no tienen evaluaciones.
 */
export async function crearEvaluacionesPlan(uid: number, sec: { id: number; nivel: string; asignatura_id: number | null }, x: Regla, tc: 'indicadores' | 'unica') {
  const periodos = await q<any>('SELECT id FROM {S}.periodos WHERE usuario_id=? ORDER BY numero', [uid]);
  const comps = await q<any>('SELECT id, clave, nombre FROM {S}.componentes WHERE usuario_id=? AND nivel=? AND COALESCE(asignatura_id,0)=? AND clave IS NOT NULL',
    [uid, sec.nivel, sec.asignatura_id ?? 0]);
  const creadas: string[] = [];
  for (const k of x.componentes) {
    const comp = comps.find((c) => c.clave === k.clave);
    if (!comp || k.pct <= 0 || k.clave === 'asistencia') continue;
    let partes: number[], nombres: string[];
    if (k.clave === 'tc') { if (tc !== 'unica') continue; partes = [k.pct]; nombres = ['Trabajo cotidiano']; }
    else if (!k.cantidad) continue;
    else {
      partes = repartir(k.pct, k.cantidad);
      const sing = SINGULAR[k.nombre] ?? k.nombre;
      nombres = partes.map((_, i) => (k.cantidad! > 1 ? `${ROMANOS[i] ?? i + 1} ${sing}` : sing));
    }
    let alguna = false;
    for (const p of periodos) {
      const hay = await one<any>('SELECT 1 FROM {S}.evaluaciones WHERE seccion_id=? AND periodo_id=? AND componente_id=?', [sec.id, p.id, comp.id]);
      if (hay) continue;
      alguna = true;
      for (const [i, v] of partes.entries())
        await exec(`INSERT INTO {S}.evaluaciones (componente_id, seccion_id, periodo_id, nombre, puntos_total, porcentaje, tipo, origen) VALUES (?,?,?,?,?,?,'puntos','plan')`,
          [comp.id, sec.id, p.id, nombres[i], k.clave === 'tc' ? 100 : v, v]);
    }
    if (alguna) creadas.push(partes.length > 1 ? `${nombres.join(' y ')} (${partes.join(' % y ')} %)` : `${nombres[0]} (${partes[0]} %)`);
  }
  return creadas;
}

/** Regla del MEP de una materia del docente para su curso lectivo, con la forma de calificar el trabajo cotidiano */
export async function reglaDeMateria(uid: number, asignaturaId: number) {
  const a = await one<any>('SELECT regla, tc_modo FROM general.asignaturas WHERE id=? AND usuario_id=?', [asignaturaId, uid]);
  if (!a?.regla) return null;
  const anio = await anioVigente((await getAjustes(uid)).curso_lectivo);
  const x = await regla(anio, a.regla);
  return x ? { regla: x, tc: (a.tc_modo === 'unica' ? 'unica' : 'indicadores') as 'indicadores' | 'unica', anio } : null;
}

// ── Materias básicas: se eligen de la lista y traen su tipo del reglamento ─────
// pide: la materia necesita un nombre propio (subáreas técnicas, talleres…)
export type MateriaBase = { ciclo: string; nombre: string; codigo: string; pide?: boolean };
const M = (ciclo: string, codigo: string, nombres: string[], pide = false): MateriaBase[] => nombres.map((nombre) => ({ ciclo, nombre, codigo, ...(pide ? { pide } : {}) }));
export const MATERIAS: MateriaBase[] = [
  ...M('primaria', '40a', ['Matemática', 'Español', 'Ciencias', 'Estudios Sociales y Educación Cívica', 'Inglés', 'Francés', 'Español como segunda lengua']),
  ...M('primaria', '40b', ['Educación Musical', 'Educación Física', 'Educación para el Hogar', 'Artes Industriales']),
  ...M('primaria', '40c', ['Educación Religiosa']),
  ...M('primaria', '40f', ['Formación Tecnológica']),
  ...M('primaria', '40h', ['Artes Plásticas']),
  ...M('primaria', '40d', ['Cultura Indígena', 'Lengua Indígena']),
  ...M('iii', '41a', ['Matemática', 'Español', 'Estudios Sociales', 'Ciencias', 'Inglés', 'Francés']),
  ...M('iii', '41b', ['Educación Cívica', 'Artes Plásticas', 'Educación para el Hogar', 'Artes Industriales', 'Educación Física', 'Educación Musical', 'Psicología', 'Formación Tecnológica']),
  ...M('iii', '41e', ['Educación Religiosa']),
  ...M('iii', '41d', ['Orientación', 'Educación para la Paz y la Convivencia']),
  ...M('iii', '41f', ['Inglés Conversacional (CTP)']),
  ...M('iii', '41f', ['Taller exploratorio'], true),
  ...M('diversificada', '42a', ['Matemática', 'Español', 'Estudios Sociales', 'Biología', 'Física', 'Química', 'Inglés', 'Francés']),
  ...M('diversificada', '42b', ['Educación Física', 'Educación Musical', 'Artes Plásticas']),
  ...M('diversificada', '42c', ['Educación Cívica']),
  ...M('diversificada', '42d', ['Educación Religiosa']),
  ...M('diversificada', '42e', ['Filosofía', 'Psicología']),
  ...M('diversificada', '42f', ['Orientación', 'Educación para la Paz y la Convivencia']),
  ...M('diversificada', '42w', ['Formación Tecnológica']),
  ...M('diversificada', '42h', ['Subárea técnica (CTP diurno)'], true),
  ...M('diversificada', '42i', ['Subárea técnica (CTP nocturno o plan a dos años)'], true),
  ...M('diversificada', '42v', ['Subárea técnica (modalidad dual)'], true),
  ...M('diversificada', '42g', ['Tecnología (colegio académico diurno)'], true),
  ...M('vocacional', '44a', ['Matemática', 'Ciencias', 'Español', 'Estudios Sociales', 'Inglés']),
  ...M('vocacional', '44b', ['Educación Física', 'Educación Musical', 'Artes Plásticas']),
  ...M('vocacional', '44c', ['Educación Religiosa']),
];
