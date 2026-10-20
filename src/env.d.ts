/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/auth').Usuario;
    /** Institución activa (puede faltar si el docente aún no tiene ninguna) */
    inst: import('./lib/auth').Institucion | null;
    instituciones: import('./lib/auth').Institucion[];
  }
}
