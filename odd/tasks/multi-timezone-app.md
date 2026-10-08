# Feature: multi-timezone-app (issue #163, lado app)

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/163
Worktree: `.worktrees/medica-app/multi-zona-horaria` · Branch: `eliumontoya/multi-zona-horaria`
OpenSpec change: `openspec/changes/user-timezone-preferences/`

## Alcance de esta change (acordado con el usuario)

- Lado app: cada usuario elige su zona horaria de trabajo; toda la presentación
  de horarios (agenda, citas, métricas) se adapta a la zona de quien la ve.
- El instante de la cita se fija en timestamptz (ya es así); el cambio es de
  preferencia por usuario + presentación parametrizada.
- **Fuera de alcance aquí:** Eva preguntando zona horaria por WhatsApp con
  default configurable → change posterior.

## Tareas

1. [x] Exploración: mapear consumidores de `clinic-time.ts` / `timezone.ts` y
   cualquier `America/Mexico_City` hard-codeado; modelo de usuarios de la app.
   Evidencia: `openspec/changes/user-timezone-preferences/exploration.md`.
   Hallazgos clave: sin tabla de perfiles (habría que crear la primera
   preferencia por usuario); `timezone.ts` y `clinic-time.ts` con TZ fija;
   captura datetime-local solo en `app/(admin)/appointments/page.tsx`.
2. [x] Artefactos OpenSpec: proposal, delta specs (RFC 2119 + GWT), design,
   tasks, state.yaml. Autoría delegada a gentle-ai-worker; revisados por el
   orquestador. Decisiones D1 (tabla user_settings + RLS), D5 (helpers
   parametrizados con default clínica), D8 (wizard público fuera), D9
   (métricas permanecen clínicas).
3. [ ] Aprobación del proposal por el usuario.
4. [ ] Migración BD: preferencia de zona horaria por usuario.
5. [ ] Núcleo tz parametrizado + settings UI + presentación por vista.
6. [ ] Verificación: unit, local-db, typecheck, lint, build.
7. [ ] Archive + PR (Closes #163).

## Commits (evidencia)

- (pendiente)

## Decisiones

- SDD completo hasta PR; prioridad lado app (Eva queda para change posterior).
- Fallback de skill: no existen subagentes `sdd-*`; se usan
  `gentle-ai-explore` / `gentle-ai-worker` / `gentle-ai-verify`.
