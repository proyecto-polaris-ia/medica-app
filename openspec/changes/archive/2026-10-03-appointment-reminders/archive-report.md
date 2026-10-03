# Archive Report: appointment-reminders

**Change**: appointment-reminders (Recordatorios automáticos de citas por WhatsApp — Issue #86)
**Archived**: 2026-10-03
**Prior phase artifacts**: proposal.md, specs/{appointment-reminders,wcc-command-center,appointments-calendar-view}/spec.md, design.md, tasks.md, verify-report.md

## Final State (authoritative — at close)

The change is **COMPLETE and archived**. Verification outcome: **PASS WITH WARNINGS**.

| Fact | Value |
|------|-------|
| Verdict | PASS WITH WARNINGS — 0 CRITICAL, 0 MAJOR; 1 MINOR corregido (dry_run DEFAULT true), 1 MINOR aceptado (enum sin 'skipped') |
| Tests | 846/846 pass (106 archivos) |
| Typecheck | `npx tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 |
| Lint | Omitido — sin script en package.json (decisión del usuario; follow-up aparte) |
| Requisitos | 13 requisitos / 33 escenarios en 3 capabilities |
| Entrega | 3 PRs encadenados (decisión del usuario por tamaño de review) |

## Commits

- `27ce4e2` feat(appointments): add appointment reminders schema and domain helper
- `2c9284a` feat(cron): add appointment reminders cron endpoint and schedule
- `3bbccdd` feat(admin): surface appointment reminders in panel and command center
- fix: default appointment_reminders.dry_run to true (higiene fail-closed, MINOR del verify)

## Pendientes posteriores al merge (fuera de este cambio)

1. Plantilla HSM `recordatorio_cita`: debe estar `Approved` en Meta Business; congelar el orden de `bodyParameters` contra la plantilla aprobada antes de encender envíos reales.
2. Encendido seguro: definir `APPOINTMENT_REMINDERS_ENABLED=true` y `APPOINTMENT_REMINDERS_DRY_RUN=false` solo tras la aprobación de Meta.
3. Segunda corrida diaria del cron (`0 3 * * *`) si el plan de Vercel permite frecuencia sub-diaria.
4. Configurar `APPOINTMENT_REMINDER_CLINIC_ADDRESS` (dirección/indicaciones del consultorio).
5. Script `lint` en package.json (hueco de verificación preexistente).
6. Test E2E de doble POST del cron como red de idempotencia (NOTE del verify).
