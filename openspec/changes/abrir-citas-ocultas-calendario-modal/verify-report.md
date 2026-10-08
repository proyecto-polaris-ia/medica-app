# Verify Report: Modal de citas del día desde "+N más"

**Change**: abrir-citas-ocultas-calendario-modal · **Issue**: [#172](https://github.com/proyecto-polaris-ia/medica-app/issues/172) · **Fecha**: verificación ejecutada antes del cierre

## Resumen

Implementación completa y verificada en verde. La verificación fue doble: la del
worker (evidencia de RED→GREEN por unidad) y una verificación independiente
read-only (`gentle-ai-verify`) sobre el árbol sin commitear.

## Comandos y resultados

| Check | Comando | Resultado |
| --- | --- | --- |
| Suite completa de componentes | `npx vitest run src --exclude 'tests/e2e/**'` | PASS — 78 files, **863 tests passed** \| 248 skipped |
| Suite de la página de citas | `npx vitest run "app/(admin)/appointments" --exclude 'tests/e2e/**'` | PASS — 47 tests |
| Suites del calendario (RED→GREEN del worker) | `npx vitest run src/components/admin/calendar --exclude 'tests/e2e/**'` | PASS — 4 files, 44 tests (RED confirmado antes de implementar) |
| Typecheck | `npx tsc --noEmit` | PASS — exit 0 |
| Lint | `npx next lint` | PASS — exit 0, solo warnings preexistentes en archivos ajenos al cambio |
| Build completo | `npx next build` | SKIP — cubierto por `tsc --noEmit`; las suites e2e/Supabase-local no aplican (cambio de UI sin datos) |

## Evidencia estructural (path:line)

- `DayCell.tsx:84-93` — overflow es `<button type="button">` nativo con
  `aria-label="Ver N citas más de este día"`; altura de celda intacta
  (`min-h-[6rem]`, DayCell.tsx:33,41).
- `MonthCalendar.tsx:26,51,56-64` — estado `overflowDayKey`, `onSelectDay` y
  render condicional de `DayAppointmentsModal` con `blocksByDay[overflowDayKey]`.
- `DayAppointmentsModal.tsx:47-49,59-60,99-103,107-109` — sort por `startLabel`
  antes de renderizar; listener de Escape con cleanup; backdrop cierra solo si el
  target es el backdrop; `role="dialog"` + `aria-modal` + `aria-labelledby`.
- `timezone.ts:243-244,256-257,279-286` — `providerName?`/`notes?` opcionales,
  copiados solo si están presentes; consumidores aditivamente compatibles
  (corroborado por tsc).
- `page.tsx:17,247-248,~251` — import de `statusLabel` compartido, memo con
  `providers` en deps, enriquecimiento sin consultas nuevas.
- Tests de fecha sin aserciones frágiles de string completo: contención por
  partes (`/5 de octubre de 2026/`, `/lunes/`, etc.).

## Escenarios de la delta spec

- **Acceso por desbordamiento del día**: botón nativo accesible y grilla sin
  deformar — cubierto por tests de `MonthCalendar.test.tsx` y spot-check.
- **Modal de citas del día**: lista completa ordenada, campos por cita, estado
  en español, notas condicionales, expediente y edición con cierre del modal —
  cubierto por `DayAppointmentsModal.test.tsx` (12 tests) y 3 tests nuevos de
  integración en `MonthCalendar.test.tsx`.
- **Cierre y accesibilidad del modal**: Escape/fondo/✕, semántica de diálogo,
  foco y trampa Tab, panel responsivo — cubiertos por tests del modal.

## Pendientes / fuera de alcance

- Build completo y suites e2e/Supabase-local: no ejecutados (no aplican a este
  cambio de UI sin datos ni migraciones).
- La verificación funcional en navegador (manual) queda como paso opcional del
  revisor humano; la cobertura de Testing Library cubre los escenarios
  aceptados.
