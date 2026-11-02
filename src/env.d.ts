/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/auth').Usuario;
    /** Institución activa (puede faltar si el docente aún no tiene ninguna) */
    inst: import('./lib/auth').Institucion | null;
    instituciones: import('./lib/auth').Institucion[];
    /** Periodos del docente en el colegio activo y el periodo de trabajo (elegido en el menú o el de hoy) */
    periodos: { id: number; numero: number; nombre: string; fecha_ini: string | null; fecha_fin: string | null }[];
    periodo: { id: number; numero: number; nombre: string; fecha_ini: string | null; fecha_fin: string | null } | null;
  }
}
