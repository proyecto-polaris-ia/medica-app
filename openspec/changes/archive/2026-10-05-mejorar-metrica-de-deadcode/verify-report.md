# Verify Report: mejorar-metrica-de-deadcode

Fecha: 2026-10-05 · Issue: [#130](https://github.com/proyecto-polaris-ia/medica-app/issues/130)
Branch: `chore/mejorar-metrica-de-deadcode` · Base: `origin/main` @ `f8387e0` (PR #134) · HEAD al verificar: `b990e8a`

**Verdict: PASS WITH WARNINGS**

Cambio de preservación de comportamiento (limpieza de código muerto + métrica
sostenida). Los seis comandos de cierre del `design.md` §Plan de verificación se
ejecutaron sobre el HEAD del branch. Cinco pasan limpios; el sexto (`test:local`)
presenta un fallo **preexistente y ambiental** que se reproduce idéntico en
`origin/main`, adjudicado en §6.4. No hay issues de Knip remanentes, no hay
regresión de tipos, lint, build ni auditoría de dependencias de runtime.

## Completitud

| Métrica | Valor |
|---------|-------|
| Tareas totales | 20 |
| Tareas completas | 20 |
| Tareas incompletas | 0 |

Todas las tareas de `tasks.md` (secciones 1–6) quedan marcadas `[x]`. La sección
6 (verificación de cierre) se cierra con este reporte.

## Evidencia de cierre (tasks 6.1–6.5)

| Task | Comando exacto | Resultado observado | Veredicto |
|------|----------------|---------------------|-----------|
| 6.1 | `npm run knip` (equivale a `npx knip`) | exit 0, **0 issues** (salida sin hallazgos; sólo hint informativo del plugin de Playwright) | ✅ PASS |
| 6.2 | `npm run typecheck` (`tsc --noEmit`) | exit 0, sin salida | ✅ PASS |
| 6.2 | `npm run lint` (`eslint .`) | exit 0, **0 errores**, 33 warnings preexistentes | ✅ PASS |
| 6.3 | `npm run build` | exit 0, build de Next exitoso | ✅ PASS |
| 6.5 | `npm audit --omit=dev` | **0 vulnerabilities** en el árbol de producción | ✅ PASS |
| 6.4 | `npm run test:local` | **8 failed \| 1353 passed (1361)** — fallo preexistente, ver §6.4 | ⚠️ ADJUDICADO |

### 6.1 Métrica de deadcode

`npm run knip` sale con código **0** y **0 issues** (Knip 6 con `maxIssues=0`
sólo sale 1 ante issues reales; los configuration/tag hints son warnings y no
cambian el exit code). La métrica mejoró de **105 → 0** issues, cumpliendo el
requisito "Reporte reproducible de código muerto".

### 6.2 Tipos y lint

`npm run typecheck` (exit 0, sin salida) confirma que el import de tipo `chat`
sigue cubierto por el shim `agent/eve-shim.d.ts:53` sin agregar el paquete.
`npm run lint` sale con **0 errores** y 33 warnings. Los 33 warnings son
**preexistentes y no cambiaron respecto del baseline** (no fueron introducidos
por este cambio): el conteo es idéntico al de `origin/main`.

### 6.3 Build

`npm run build` completa con exit 0. Nótese que el paso de CI para Knip se
agregó como paso normal (sin `continue-on-error`), consistente con D6.

### 6.5 Guardas de dependencias

- `npm audit --omit=dev` → **found 0 vulnerabilities** en producción.
- Excepción aceptada y documentada: `npm audit` (árbol completo, incluido dev)
  reporta **5 hallazgos high-severity dev-only** en la cadena `braces`
  (`eslint-config-next` → `@typescript-eslint` → `braces`), sin parche
  disponible. Es la **excepción aceptada documentada en el PR #134**
  (`a225045 fix(deps): restore ESLint 9 plugin, adopt bundler resolution, accept
  unpatched braces chain` y `cf2a487 docs(odd): record CI-driven fixes and
  accepted braces exception`). No afecta el árbol de runtime.
- `next`, `react`/`react-dom` y `eve` conservan su versión mayor previa
  (verificado en `package.json`; el diff de `package-lock.json` se limitó al
  retiro de `@chat-adapter/state-redis` y `ai-sdk-provider-opencode-sdk`).
- `travelhub-app`: **0 commits lo tocan** desde `origin/main`. El cambio no
  modificó nada fuera de este repositorio.

### 6.4 Adjudicación de `test:local` (fallo preexistente, NO causado por este cambio)

**Observado:** `npm run test:local` → **8 failed | 1353 passed (1361)**.
Rerun aislado de `src/lib/admin/__tests__/patient-files.test.ts` → **8 failed |
16 passed**. Los 8 fallos son la totalidad de los fallos de la suite.

**Causa raíz (fuera del repositorio):** `storage-api v1.71.0` contra
PostgreSQL **17.11** emite un `ON CONFLICT` sobre `storage.objects` que PG17 no
puede resolver — error **42P10** (`infer_arbiter_indexes`). El error se origina
**dentro de la imagen de `storage`**, no en código del repositorio: el mensaje
de la API de storage surge en `src/lib/admin/patient-files.ts:213`
(`throw new Error(uploadError.message)`), es decir, se propaga el error de la
imagen. Ninguna migración ni archivo del branch toca `storage.objects`
(verificado: `git log origin/main..HEAD --name-only | grep -i storage` → vacío;
`grep -n "storage.objects\|ON CONFLICT\|42P10" src/lib/admin/patient-files.ts`
→ sin coincidencias).

**Prueba de baseline:** los **mismos 8 fallos** se reproducen en un worktree
limpio sobre `origin/main` @ `f8387e0` (`npm ci` + `supabase db reset` + misma
suite) → **8 failed | 16 passed**, con la **misma firma 42P10** en
`src/lib/admin/patient-files.ts:213`. Es decir, el fallo existe **antes** de
este cambio.

**Conclusión:** fallo **preexistente y ambiental**, **NO causado** por este
cambio. Se registra como **follow-up** (requiere pin de `storage-api`/PG17 o
actualización de la imagen de storage); no bloquea el veredicto de este cambio.
Se suma a los fallos preexistentes ya conocidos del entorno, conforme al
contrato de "Known environmental failures".

**Flakiness no contabilizada:** en una corrida paralela se observaron timeouts
de suite-lock de 10s en `beforeAll`. Se tratan como flakiness de concurrencia,
no como fallo determinista, y no se contaron en el veredicto.

## Matriz de cumplimiento del spec (`code-quality` — 6 requisitos / 17 escenarios)

| Requisito | Escenario | Evidencia | Resultado |
|-----------|-----------|-----------|-----------|
| Reporte reproducible | Reporte limpio al cerrar el cambio | `npm run knip` → 0 issues, exit 0 | ✅ COMPLIANT |
| Reporte reproducible | Resultado idéntico en local y en CI | Mismo `knip.json` versionado + paso CI `npm run knip` (5.1) | ✅ COMPLIANT |
| Reporte reproducible | Aparición de un issue nuevo | Paso CI normal sin `continue-on-error`; falla ante issues reales | ✅ COMPLIANT |
| Exclusiones justificadas | Exclusión con justificación verificable | Justificación por clave en `design.md` D1/D2 (documentación referenciada) | ✅ COMPLIANT |
| Exclusiones justificadas | Exclusión sin justificación | Sin exclusiones sin justificar; toda clave tiene referencia en design | ✅ COMPLIANT |
| Exclusiones justificadas | `middleware.ts` fuera de `entry` | `knip.json` `entry` sin `middleware.ts`; detectado por plugin Next | ✅ COMPLIANT |
| Exclusiones justificadas | Entradas de `ignoreBinaries`/`ignoreDependencies` | `ignoreBinaries:["supabase"]`, `ignoreDependencies:["eslint-config-next","chat"]`, `ignoreExportsUsedInFile:true` | ✅ COMPLIANT |
| Eliminación con evidencia | Verificación antes de borrar | `grep` por símbolo/archivo documentado en cada tarea 3.x/4.x | ✅ COMPLIANT |
| Eliminación con evidencia | Uso confirmado conserva el símbolo | `src/lib/whatsapp/inbound-decision.ts` conservado (grep con uso) | ✅ COMPLIANT |
| Eliminación con evidencia | Bloque de limpieza sin regresiones | Knip 0 issues; typecheck/lint/test/build en verde por grupo | ✅ COMPLIANT |
| Retiro de dependencias/archivos | Dependencias muertas eliminadas | Sin `@chat-adapter/state-redis` ni `ai-sdk-provider-opencode-sdk` (2.1) | ✅ COMPLIANT |
| Retiro de dependencias/archivos | Archivos sin uso eliminados | 3 archivos borrados en 3.1–3.3 con grep de cero uso | ✅ COMPLIANT |
| Retiro de dependencias/archivos | Sin cambios en dependencias de runtime | Mayores de `next`/`react`/`eve` intactas | ✅ COMPLIANT |
| Métrica sostenida | Script `knip` disponible | `"knip": "knip"` en `package.json` scripts (5.1) | ✅ COMPLIANT |
| Métrica sostenida | Paso de CI no bloqueante sobre warnings | Paso sin `continue-on-error`; warnings no cambian exit code | ✅ COMPLIANT |
| Falsos positivos `chat` | Tipo `chat` cubierto sin dependencia fantasma | `tsc` verde con shim; Knip 0 issues vía `ignoreDependencies:["chat"]`; `chat` NO está en `package.json` | ✅ COMPLIANT |
| Falsos positivos `chat` | Shims de los adaptadores documentados | Shims de `@chat-adapter/whatsapp`/`state-memory` documentados en design/knip | ✅ COMPLIANT |

**Resumen:** 6/6 requisitos y 17/17 escenarios compliant. Sin escenarios
UNTESTED ni FAILING. (Nota: el encabezado de `tasks.md` menciona "20
escenarios"; el delta `specs/code-quality/spec.md` contiene 17. Se registra la
discrepancia como observación menor; no se modificó el encabezado de `tasks.md`
para no reestructurarlo.)

## TDD (design D7 — excepción de aplicabilidad documentada)

Este cambio es **preservación de comportamiento**: no existe un test unitario
que exprese "el código muerto fue eliminado". La excepción de aplicabilidad
RED/GREEN se declara explícitamente y se sustituye por verificación determinista
por comando:

- **RED (conceptual):** `npx knip` con el lote pendiente → issues > 0
  (baseline documentado: 105 issues).
- **GREEN (observado):** `npm run knip` → 0 issues, exit 0, con `typecheck`,
  `lint` y `build` en verde.
- **TRIANGULATE/REFACTOR:** verificación por frontera de grupo (lint + test +
  build + knip) tras cada lote de limpieza, según `tasks.md` sección 4.

## Cambios fuera de alcance

Ninguno. No se tocó `travelhub-app` (0 commits), no hubo cambios de runtime,
migraciones ni infraestructura fuera del retiro de las dos dependencias muertas
y la limpieza de símbolos verificada con cero uso.

## Advertencias

1. **`test:local` no verde (8/1361):** fallo preexistente y ambiental (42P10,
   `storage-api` × PG17), reproduciendo idéntico en `origin/main` @ `f8387e0`.
   Es un follow-up de entorno, no un defecto de este cambio.
2. **`braces` dev-only (5 high):** excepción aceptada y documentada del PR #134;
   `npm audit --omit=dev` está limpio. No afecta runtime.

## Riesgos residuales

- Mientras el fallo de entorno no se resuelva, la suite completa local no puede
  quedar 100% verde aun con el cambio correcto. Mitigación: prueba de baseline
  documentada en §6.4 y seguimiento de pin/actualización de `storage-api`.

## Veredicto

**PASS WITH WARNINGS** — 20/20 tareas cerradas; métrica de deadcode en **0
issues** (desde 105); `typecheck`, `lint` y `build` en verde; auditoría de
runtime sin vulnerabilidades y sin cambios en `travelhub-app`. El único fallo
de la suite es preexistente, ambiental y reproducible en `main`, por lo que no
compromete la corrección de este cambio. El change queda listo para archive.
