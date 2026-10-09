# Feature: agregar-vista-agenda-calendario (issue #175)

Vista de agenda (lista por día) dentro de la vista de Calendario de /appointments.

- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/175
- Worktree: .worktrees/medica-app/agregar-vista-de-lista-por-d-a-dentro-de-la-vist
- Rama: eliumontoya/agregar-vista-de-lista-por-d-a-dentro-de-la-vist
- Cambio OpenSpec: openspec/changes/agregar-vista-agenda-calendario/

## Tasks

1. [x] Explore — mapa de page.tsx, MonthCalendar, DayAppointmentsModal, timezone.ts, labels, tests, convención OpenSpec. Ready for Proposal: Yes. (subagente gentle-ai-explore)
2. [x] Propose → Spec → Design → Tasks — artefactos en openspec/changes/agregar-vista-agenda-calendario/
3. [x] Apply — AgendaView.tsx, tercer modo de vista, endLabel en CalendarBlock, enriquecimiento providerName/notes, tests RED→GREEN (sdd-apply via gentle-ai-worker)
4. [x] Verify — suite completa `npm test`, tsc, lint, build (sdd-verify via gentle-ai-verify)
5. [x] Archive — mover a openspec/changes/archive/YYYY-MM-DD-* y sincronizar delta al spec baseline openspec/specs/appointments-calendar-view/spec.md
6. [x] Push + PR (Closes #175)

## Decisiones clave (del issue + exploración)

- Opción A del issue: tercer modo en el toggle (Lista | Calendario | Agenda), no sub-toggle.
- Reutilizar blocksByDay / calendarAppointments: cero peticiones extra al backend.
- Falta endLabel en CalendarBlock (hora inicio–fin) → derivar en groupAppointmentsByDay.
- Enriquecimiento de page.tsx debe copiar providerName y notes a los bloques (issue #172 ya amplió el tipo).
- UI tests corren con `npm test` (vitest+RTL); test:local no aplica (no hay capa de datos nueva).
- Alternativa de accesibilidad: seguir el precedente a11y de DayAppointmentsModal (botones nativos, aria-pressed).
- Botón "Hoy" que hace scroll al día actual (nota del issue).

## Commits

- ba7a873 docs(agenda): especificar vista de agenda por día en calendario (#175)
- d8530ba feat(timezone): derivar endLabel en CalendarBlock para hora inicio–fin (#175)
- 978e34f feat(calendar): agregar AgendaView con lista de citas por día (#175)
- d04e32e feat(appointments): integrar vista Agenda como tercer modo en /appointments (#175)
- 2c4dfa2 docs(agenda): reporte de verificación PASS WITH WARNINGS (#175)
- d28d3c7 docs(agenda): archivar change y sincronizar spec baseline (#175)

## Notas del ciclo

- Revisión nativa RDD: el humano declinó el consentimiento para este candidato (consent-declined-this-candidate, riesgo medio); verificación vía assess: escritor autoverificado + verificador independiente (PASS WITH WARNINGS, 0 críticos).
- Follow-ups informativos: a11y fila role=button con botón anidado (deuda pre-existente de DayAppointmentsModal), test enfocado de CalendarNav en agenda, "Hoy" probado solo a nivel AgendaView.
