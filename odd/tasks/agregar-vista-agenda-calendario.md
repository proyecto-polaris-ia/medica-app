# Feature: agregar-vista-agenda-calendario (issue #175)

Vista de agenda (lista por día) dentro de la vista de Calendario de /appointments.

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/175
- Worktree: .worktrees/medica-app/agregar-vista-de-lista-por-d-a-dentro-de-la-vist
- Rama: eliumontoya/agregar-vista-de-lista-por-d-a-dentro-de-la-vist
- Cambio OpenSpec: openspec/changes/agregar-vista-agenda-calendario/

## Tasks

1. [x] Explore — mapa de page.tsx, MonthCalendar, DayAppointmentsModal, timezone.ts, labels, tests, convención OpenSpec. Ready for Proposal: Yes. (subagente gentle-ai-explore)
2. [ ] Propose → Spec → Design → Tasks — artefactos en openspec/changes/agregar-vista-agenda-calendario/
3. [ ] Apply — AgendaView.tsx, tercer modo de vista, endLabel en CalendarBlock, enriquecimiento providerName/notes, tests RED→GREEN (sdd-apply via gentle-ai-worker)
4. [ ] Verify — suite completa `npm test`, tsc, lint, build (sdd-verify via gentle-ai-verify)
5. [ ] Archive — mover a openspec/changes/archive/YYYY-MM-DD-* y sincronizar delta al spec baseline openspec/specs/appointments-calendar-view/spec.md
6. [ ] Push + PR (Closes #175)

## Decisiones clave (del issue + exploración)

- Opción A del issue: tercer modo en el toggle (Lista | Calendario | Agenda), no sub-toggle.
- Reutilizar blocksByDay / calendarAppointments: cero peticiones extra al backend.
- Falta endLabel en CalendarBlock (hora inicio–fin) → derivar en groupAppointmentsByDay.
- Enriquecimiento de page.tsx debe copiar providerName y notes a los bloques (issue #172 ya amplió el tipo).
- UI tests corren con `npm test` (vitest+RTL); test:local no aplica (no hay capa de datos nueva).
- Alternativa de accesibilidad: seguir el precedente a11y de DayAppointmentsModal (botones nativos, aria-pressed).
- Botón "Hoy" que hace scroll al día actual (nota del issue).

## Commits

(registrar por unidad de trabajo)
