# Verify Report — agregar-filtro-proveedores-calendario (issue #174)

**Fase:** OpenSpec / Verify (SDD) · **Veredicto:** PASS WITH WARNINGS
**Worktree:** `.worktrees/medica-app/agregar-filtro-proveedores-calendario`
**Rama:** `feat/agregar-filtro-proveedores-calendario` (cambios sin commitear de Apply)
**Fecha:** verificación read-only; no se modificó ningún archivo ni se hizo commit.

## 1. Resultado por verificación

| # | Verificación | Comando | Salida | Resultado |
|---|---|---|---|---|
| 1 | Suite completa | `npm test` | exit 0 | **1333 pruebas pasan / 0 fallan**, 243 omitidas; 142 archivos pasan / 22 omitidos. Idéntico al conteo de Apply. |
| 2 | Typecheck | `npx tsc --noEmit` | exit 0 | Sin errores (salida vacía). |
| 3 | Lint | `npm run lint` | exit 0 | 26 avisos, **0 errores**. Los 2 avisos en `app/(admin)/appointments/page.tsx` (`Link` en 4:8, `clinicTimeLabel` en 19:3) son **preexistentes** (ya aparecen en `git show HEAD:app/(admin)/appointments/page.tsx`; el cambio solo tocó la línea 5 de imports). |
| 4 | Build de producción | `npm run build` | exit 0 | Compila y prerenderiza; `/appointments` = 7.63 kB / 110 kB. |
| 5 | Suites focales | `npx vitest run "app/(admin)/appointments/page.test.tsx" "src/components/admin/calendar/__tests__/"` | exit 0 | **48 pruebas pasan (3 archivos)**: 15 nuevas en `page.test.tsx` y 8 nuevas en `ProviderLegend.test.tsx`. Coincide con el 48/48 de Apply. |

## 2. Trazabilidad de escenarios (15/15)

| Escenario (delta spec) | Prueba | Archivo |
|---|---|---|
| La leyenda conserva el universo del mes | `:54` + `page.test.tsx:727` | `ProviderLegend.test.tsx` + `page.test.tsx` |
| Entrada de la leyenda alterna su estado | `:30` + `page.test.tsx:551` | `ProviderLegend.test.tsx` + `page.test.tsx` |
| Entrada deseleccionada atenuada pero legible | `:66` | `ProviderLegend.test.tsx` |
| Sin filtrado la leyenda comunica que se muestran todos | `:42` + `page.test.tsx:593` | `ProviderLegend.test.tsx` + `page.test.tsx` |
| Seleccionar un proveedor muestra solo sus citas | `:551` | `page.test.tsx` |
| Seleccionar varios proveedores muestra solo los elegidos | `:574` | `page.test.tsx` |
| Sin selección se muestran todos los proveedores | `:593` | `page.test.tsx` |
| El filtrado precede al agrupamiento por día | `:623` (día 12: A 09:00 presente, B 11:00 ausente) | `page.test.tsx` |
| La selección se refleja en la URL y es deep-linkable | `:648` + `:667` | `page.test.tsx` |
| La selección sobrevive el cambio Lista ↔ Calendario | `:785` | `page.test.tsx` |
| "Limpiar filtros" reinicia la selección del calendario | `:684` | `page.test.tsx` |
| La lista conserva su filtro de proveedor de un solo valor | `:748` + `:767` | `page.test.tsx` |
| Ids desconocidos en la URL no rompen el calendario | `:727` + `ProviderLegend.test.tsx:94` | `page.test.tsx` + `ProviderLegend.test.tsx` |
| La fila de filtros es usable en móvil | `:821` | `page.test.tsx` |
| Los controles de filtrado son operables por teclado | `:107` | `ProviderLegend.test.tsx` |

Los 15 escenarios quedan cubiertos por al menos una prueba que pasa (verificado por
lectura del código de prueba y por ejecución observada: 48/48 en las suites focales).

## 3. Revisión contra decisiones de `design.md` (muestreo de mayor riesgo)

- **#4 (guard antes de `blocksByDay`):** `page.tsx:203-208` define
  `calendarAppointments` con el guard literal `if (calendarProviderFilter.length === 0) return appointments;`
  en `:205`, **antes** de `blocksByDay` (`:210`). Correcto.
- **#8 (universo de la leyenda sin filtrar):** `page.tsx:224-227` sigue derivando
  `visibleProviders` de `appointments` sin filtrar. Correcto.
- **#9 (guard de reescritura redundante):** `page.tsx:236`
  `if (next.join(',') === calendarProviderFilter.join(',')) return;`. Correcto.
- **#10 (sin `useEffect` que pueda provocar loop):** el diff no añade ningún
  `useEffect`; `setView` permanece intacto. Correcto.
- **#17 (`data-testid="legend-swatch"` conservado):** `ProviderLegend.tsx:47`; el
  montaje existente se actualizó en `MonthCalendar.test.tsx:205-206`. Correcto.
- **#19 (cero dependencias nuevas):** `git diff -- package.json package-lock.json`
  vacío. Correcto.

## 4. Hallazgos

- **CRÍTICO:** ninguno.
- **MAYOR:** ninguno.
- **MENOR-1 (aviso de carga de revisión):** el diff rastreado es de 597
  inserciones / 18 borrados más el archivo nuevo de 132 líneas (~730 líneas de
  código y pruebas), por encima del umbral de ~400 de `chained-pr`. `tasks.md`
  eligió explícitamente el PR único y definió un punto de corte si se rebasaba el
  umbral; es una decisión aceptada, no un defecto.
- **MENOR-2 (no atribuible a este cambio):** los 2 avisos de lint en
  `app/(admin)/appointments/page.tsx` son preexistentes en la línea base `HEAD`;
  no requieren acción en este cambio.

## 5. Invariantes confirmados

- `package.json` y `package-lock.json` sin cambios; ninguna dependencia nueva.
- Sin migraciones ni cambios en `supabase/` (`git status supabase/` vacío).
- Nada dentro de `travelhub-app` fue tocado.
- Superficies del cambio (esperadas): `app/(admin)/appointments/page.tsx`,
  `app/(admin)/appointments/page.test.tsx`,
  `src/components/admin/calendar/ProviderLegend.tsx`,
  `src/components/admin/calendar/__tests__/MonthCalendar.test.tsx` (modificados) y
  `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx` +
  `openspec/changes/agregar-filtro-proveedores-calendario/` (nuevos).
- `npm test` es el runner usado (decisión #21), con intención RED→GREEN evidenciada
  por tareas 1–12 y suite focal en verde (48/48) y suite completa en verde (1333).

## 6. No verificado / fuera de alcance

- `npm run test:local` (Supabase local) **no** se ejecutó: las pruebas de este
  cambio usan `fetch` mockeado y no requieren base de datos (design/tasks); no se
  autorizó `supabase start`.
- `tests/e2e/**` queda excluido por el script `npm test`; no se ejecutó e2e (no
  requerido).
- No se encontraron huecos funcionales; la observabilidad se limita a la
  superficie de UI/URL ejercitada por las pruebas anteriores.

## 7. Cierre

Las 5 verificaciones solicitadas pasan (incluido `npm run build`, diferido desde
Apply, tarea 13.4). Los 15 escenarios del delta spec están mapeados a pruebas que
pasan (tarea 13.5). Sin hallazgos críticos ni mayores. **Veredicto: PASS WITH
WARNINGS** por los dos avisos menores (carga de revisión por tamaño del diff y
avisos de lint preexistentes, no atribuibles a este cambio).
