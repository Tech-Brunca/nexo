# ReDDi.exe — análisis con REA (20 oct 2026)

Programa: *Registro Digital Docente (REDDi)*, versión 17.7.2026, instalado en
`C:\Program Files (x86)\ReDDi`. Solo se analizó la estructura y el comportamiento;
no se copió código, imágenes ni datos de estudiantes.

## Evidencia

| Hallazgo | Cómo se obtuvo |
|---|---|
| PE32 x86 nativo, sin metadatos .NET | REA `inspect_managed_artifact` (cli-directory-absent) |
| Delphi/VCL con QuickReport y DBNavigator | REA `inspect_pe_resources`: recursos QR*BITMAP, DBN_*, BB* |
| 47 formularios (DFM) incrustados en RCDATA | Recursos tipo 10 con firma `TPF0`, convertidos a texto |
| 979 componentes en el módulo de datos `TDM`, con ~80 consultas SQL | DFM de `TDM`, propiedad `SQL.Strings` |
| Base MySQL 5.1 embebida (`MysqlReg`, base `sisef`, 27 tablas) | Archivos `.frm` (solo definición de columnas) |
| `Prj_Conf.exe`: configurador aparte | Listado de la carpeta |

## Módulos (botones del formulario principal `TFRM_PCP`)

Grupos, Secciones, Sub-grupos, Estudiantes (con importación desde Excel, fila 7),
Periodos, Parámetros (componentes de evaluación por nivel y ponderado), Indicadores
(Inicial 1 / Intermedio 2 / Avanzado 3, importación de plantilla), Evaluaciones,
Calificaciones (directas y por indicadores), Asistencia (AI, AJ, TI, TJ, lecciones
efectivas, % ausentismo), Convocatorias (1 y 2, acta), Alerta temprana (ausentismo,
plantilla Excel), Informes (≈20 reportes QuickReport), Exportar a SEA / Excel,
Importar SEA, Respaldo/Restaurar, Configuración, Notificaciones por WhatsApp.

## Reglas observadas

- Calificación por indicador: *Sin calificar* no se toma en cuenta; *Sin entregar* = 0;
  Inicial = 1; Intermedio = 2; Avanzado = 3 (texto de `TFRM_CLF`).
- Alerta: estudiantes con más de 2 ausencias en los últimos 15 días
  (`AQry_Aus_Alt`: `Ast_Fch BETWEEN DATE_SUB(CURDATE(), INTERVAL 15 DAY) AND CURDATE() … HAVING Cant > 2`).
- Condición: Aprobado / Aplazado / Reprobado contra la nota aprobatoria de la sección (`DAS_Not_Apb`).
- Nota anual ponderada por periodo (`ponderado.Pdr_Val`), convocatorias 1 y 2 (`AQry_Cvc`);
  "-1" para ausente a convocatoria.

## Tablas de `sisef` → esquema propio

| ReDDi | Nexo |
|---|---|
| parametros, docentes | instituciones, usuarios, ajustes |
| asignaturas, asn_dct | asignaturas |
| secciones, dct_asn_scc | secciones (nota_aprobatoria) |
| estudiantes | estudiantes |
| etd_asn (+ ExA_Sgrp) | matriculas (+ subgrupo) |
| periodos, ponderado | periodos (ponderado), lecciones |
| componentes, evaluaciones (Evl_Niv, Evl_Pdr) | componentes (por nivel) |
| dtl_evl, calificaciones, dtl_clf | evaluaciones, notas |
| indicadores, idc_devl, clf_idc | indicadores, evaluacion_indicadores, valoraciones |
| asistencia | asistencia |
| convocatoria | convocatorias |

## No implementado (posibles siguientes pasos)

Exportar/importar SEA, notificaciones por WhatsApp, los ≈20 informes con formato
oficial, importación directa desde la base de ReDDi.

## Diferencias de Nexo frente a ReDDi

ReDDi es de un solo docente y una sola PC. Nexo es multiusuario: cada docente
tiene su cuenta (aprobada por un administrador), trabaja en una o varias instituciones
y sus estudiantes, secciones, indicadores y notas son solo suyos.
