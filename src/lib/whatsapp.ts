import { q } from './db';

// Comunicados por WhatsApp: Nexo arma el mensaje y abre WhatsApp (web o teléfono) con el texto
// listo; el docente revisa y presiona Enviar. Sale desde su propio número, sin costo.

export const TIPOS: Record<string, { titulo: string; ayuda: string; texto: string }> = {
  ausencia: {
    titulo: 'Ausencia',
    ayuda: 'Cuando el estudiante no se presentó a lecciones',
    texto: 'Buenas, {encargado}. Le saluda {docente}, docente de {asignatura} en {colegio}. Le informo que {estudiante} ({seccion}) estuvo ausente el {fecha} ({lecciones} lección(es)). Si la ausencia tiene justificación, por favor hágamela llegar. Gracias.',
  },
  tardia: {
    titulo: 'Llegada tardía',
    ayuda: 'Cuando el estudiante llegó tarde',
    texto: 'Buenas, {encargado}. Le saluda {docente}, docente de {asignatura} en {colegio}. Le informo que {estudiante} ({seccion}) llegó tarde a lecciones el {fecha}. Gracias por su atención.',
  },
  no_entrego: {
    titulo: 'No entregó una evaluación',
    ayuda: 'Desde una evaluación, a quienes quedaron como «No entregó»',
    texto: 'Buenas, {encargado}. Le saluda {docente}, docente de {asignatura} en {colegio}. Le informo que {estudiante} ({seccion}) no entregó la evaluación «{evaluacion}» del {fecha}. Quedo atento(a) para coordinar. Gracias.',
  },
  alerta: {
    titulo: 'Alerta de ausentismo',
    ayuda: 'Desde la alerta temprana',
    texto: 'Buenas, {encargado}. Le saluda {docente}, docente de {asignatura} en {colegio}. {estudiante} ({seccion}) acumula {lecciones} lección(es) de ausencia injustificada en los últimos días. Me gustaría conversar con usted para apoyarle. Gracias.',
  },
  libre: {
    titulo: 'Mensaje general',
    ayuda: 'Comunicado a todo un grupo',
    texto: 'Buenas, {encargado}. Le saluda {docente}, docente de {asignatura} en {colegio}. ',
  },
};
export const VARIABLES = ['encargado', 'estudiante', 'seccion', 'asignatura', 'docente', 'colegio', 'fecha', 'evaluacion', 'lecciones'];

export async function plantillas(uid: number) {
  const propias = await q<{ tipo: string; texto: string }>('SELECT tipo, texto FROM general.plantillas WHERE usuario_id=?', [uid]);
  const r: Record<string, string> = {};
  for (const t of Object.keys(TIPOS)) r[t] = propias.find((p) => p.tipo === t)?.texto ?? TIPOS[t].texto;
  return r;
}

/** Reemplaza {variable}; si falta el encargado usa un saludo neutro */
export function llenar(texto: string, v: Record<string, string | number | null | undefined>) {
  return texto.replace(/\{(\w+)\}/g, (m, k) => {
    const x = v[k];
    if (k === 'encargado' && !x) return 'encargado(a)';
    return x === null || x === undefined || x === '' ? m : String(x);
  });
}

/** Número en formato internacional: 8 dígitos se asumen de Costa Rica (+506) */
export function telefonoWa(tel: string) {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 8) return '506' + d;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}
export function enlaceWa(tel: string, texto: string) {
  const n = telefonoWa(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

/** Fecha 'AAAA-MM-DD' a texto en español: «martes 20 de octubre» */
export function fechaLarga(f: string | null) {
  if (!f) return '';
  const d = new Date(f + 'T12:00:00');
  return d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
}
