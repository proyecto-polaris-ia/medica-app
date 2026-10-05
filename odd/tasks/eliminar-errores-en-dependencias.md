# Feature: eliminar-errores-en-dependencias (issue #131)

**Issue:** https://github.com/proyecto-polaris-ia/medica-app/issues/131
**Branch:** `eliumontoya/eliminar-errores-en-dependencias` (worktree `eliminar-errores-en-dependencias`)
**Creado:** 2026-10-05

## Objetivo

Reducir las vulnerabilidades de dependencias: métrica actual
**15 vulnerabilities (critical: 2, high: 8, moderate: 5, low: 0; accepted: 0)**.

## Análisis (npm audit, mapeo completo)

| Cadena | Paquetes afectados | Severidades | Ruta de arreglo verificada |
|---|---|---|---|
| vitest 2.1.9 | vitest, @vitest/coverage-v8, @vitest/mocker, vite, vite-node, esbuild | 2 critical + 4 moderate | Upgrade `vitest` → 5.0.3 + `@vitest/coverage-v8` → 5.0.3 (dev-only) |
| postcss vía next 15.5.24 | postcss (bundled ≤8.5.22), next | 1 high + 1 moderate | `overrides`: `postcss@^8.5.26` (sin subir Next 16) |
| undici vía eve 0.52.2 | undici 8.9.0, eve | 2 high… (1 high + 1 moderate) | `overrides`: `undici@^8.11.2` (fixed ≥8.10.2; sin subir eve 0.71) |
| braces vía eslint-config-next 15 | braces, micromatch, fast-glob, @next/eslint-plugin-next, eslint-config-next | 5 high | Advisory GHSA-vfj7-8cjw-p6xm **sin parche** (braces 3.0.3 es el último). La vía es romper la cadena: `overrides`: `@next/eslint-plugin-next@14.2.35` (usa `glob@10`/minimatch, sin fast-glob). Mantener eslint-config-next 15.5.24 |

Nota: `braces` no tiene versión parcheada publicada; cualquier cadena que lo
arrastre quedará marcada mientras exista. Romper la arista fast-glob es la
única vía sin downgrade completo de eslint-config-next (que tiene peer eslint ^8
y rompería ESLint 9).

## Tareas

- [x] Crear change OpenSpec `dependency-vulnerability-remediation` (proposal/specs/design/tasks/exploration/state).
- [x] Apply: vitest 5 + overrides (postcss, undici, @next/eslint-plugin-next, glob) + `npm install` + migración de `vitest.config.ts` (`test.projects`) y `vitest.setup.ts` (`jest-dom/vitest`).
- [x] Verify: npm audit → 0 ✅; lint ✅ (33 warnings baseline); typecheck ✅; test ✅ (1145 passed); build ✅ PASS (verificador gentle-ai-verify).
- [x] Archive + work-unit commits + PR. Spec principal `openspec/specs/dependency-management/` + change en `archive/2026-10-05-dependency-vulnerability-remediation/`.
- [x] Cierre: resumen, checks pendientes, siguiente paso. PR #134.

## Decisión aprobada: Opción A (migrar a Vitest 5)

El orquestador aprobó conservar `vitest@5.0.3` y migrar la configuración. La
Opción B (`vitest@3.2.7`) se rechazó porque `@vitest/mocker@3.2.7` sigue en el
rango vulnerable (`<=4.1.10`) de GHSA-82fw y `npm audit` no llegaría a 0.

Cambios aplicados (superficies autorizadas):

- `vitest.config.ts` — `environmentMatchGlobs` (eliminado en Vitest 5) migrado a
  `test.projects` con proyectos `node` y `jsdom`; los globs de `jsdom` son los
  mismos que antes, así que la asignación de entorno por archivo no cambia.
- `vitest.setup.ts` — import `@testing-library/jest-dom/vitest`, que augmenta los
  matchers sobre `Assertion<R, T>` de Vitest 5 (elimina los 279 `TS2339`). No se
  necesitó `d.ts` ambiental ni tocar `tsconfig.json`.
- `package.json` — se quitó `allowScripts.esbuild@0.21.5` (obsoleto;
  `npm ls esbuild` vacío). No cambia el lockfile.

## Evidencia (verificación)

Estado final (compuertas del orquestador):

- `npm audit` → `found 0 vulnerabilities`.
- `npx tsc --noEmit` → 0 errores.
- `npm run test` → 1145 passed / 216 skipped (1361); 127 archivos passed /
  19 skipped (146) = línea base.
- `npm run lint` → 33 problems (0 errors, 33 warnings) = línea base.
- Triangulación por proyecto: `--project node` → 84 archivos (624 passed /
  216 skipped); `--project jsdom` → 62 archivos (521 passed). Suma exacta del
  total, sin huérfanos ni duplicados.
- `npx tsc --noEmit` (estado previo, RED reproducido) → 280 errores
  (279 `TS2339` + 1 `TS2769`).
- `npm run test` (estado previo, RED reproducido) → 156 failed / 989 passed /
  216 skipped; 23 archivos fallidos.
- Versiones resueltas: vitest 5.0.3, @vitest/coverage-v8 5.0.3, vite 8.3.2,
  @vitejs/plugin-react 5.2.0, postcss 8.5.28, undici 8.11.2, glob 10.5.0,
  @next/eslint-plugin-next 14.2.35 (anidado), @types/node 22.20.5;
  next 15.5.24, eve 0.52.2, react 19.0.0 sin cambios.
- `npm ls --depth=0` → sin dependencias inválidas ni extraneous.

Nota: `npm run build` fue ejecutado por el verificador del orquestador
(gentle-ai-verify): EXIT=0, compilación exitosa, árbol sin cambios tras build.

## Evidencia (commits)

- `62c7733` — chore(deps): remediate 15 npm audit vulnerabilities (package.json,
  package-lock.json, vitest.config.ts, vitest.setup.ts).
- `0337275` — docs(openspec): archive dependency-vulnerability-remediation change
  (spec principal `dependency-management` + change en `archive/2026-10-05-...`).
- Revisión nativa (RDD): lineage `review-389131bc7a09ef02`, riesgo medio, lente
  `review-reliability` → **approved** y acuse quemado
  (`gentle-ai.review-acknowledged/v1`, rev `7e10e5e0…`). 5 hallazgos, todos
  informativos (0 bloqueantes): WARNING `R3-silent-drop-js-tests`
  (`vitest.config.ts:33-48`, proyectos jsdom solo incluyen `*.test.ts*`; trabajo
  posterior) y SUGGESTIONs `R3-brittle-baseline-count`, `R3-ci-audit-should`,
  `R3-tracking-inconsistency`, `R3-unscoped-overrides`.
