# Tasks: ux-truncar-notas-evolucion

Truncamiento de textos largos en notas de evolución con botón "Ver más"
(issue [#182](https://github.com/proyecto-polaris-ia/medica-app/issues/182)).

Convención de estado: `[ ]` pendiente · `[x]` completo. TDD activo
(`openspec/config.yaml` → `strict_tdd: true`): cada comportamiento escribe
primero la prueba que falla (**RED**), luego la implementación mínima
(**GREEN**). Runners: `npm test` (Vitest), `npx tsc --noEmit`, `npm run lint`,
`npm run build`.

Cada tarea cita los escenarios del delta
`specs/clinical-record/spec.md` y las decisiones (`D#`) de `design.md` §3.

---

## Fase 0 — Artefactos SDD

- [x] 0.1 `proposal.md` — alcance, impacto y rollback plan.
- [x] 0.2 `specs/clinical-record/spec.md` — delta `ADDED`: truncamiento a 150
  caracteres, expansión/colapso, fallback, estado independiente y subjetivo
  sin truncar.
- [x] 0.3 `design.md` — decisiones D1–D7 y estrategia de pruebas.

## Fase 1 — Componente `ExpandableText` (TDD)

- [x] 1.1 **RED** — `src/components/admin/__tests__/ExpandableText.test.tsx`:
  pruebas para texto corto sin botón, truncado exacto a 150 + `'...'` con
  botón "Ver más" y `aria-expanded="false"`, expansión a texto completo con
  "Ver menos" y `aria-expanded="true"`, colapso, fallback `null → '—'` y
  estado independiente entre instancias (escenarios del delta; D2, D4, D5,
  D6). Confirmar que fallan (el componente no existe).
- [x] 1.2 **GREEN** — `src/components/admin/ExpandableText.tsx`: implementación
  mínima que pasa la suite de 1.1 (D1, D2, D4, D5, D6). Triangular bordes:
  texto de exactamente 150 caracteres (sin botón) y 151 (con botón).

## Fase 2 — Integración en la lista SOAP

- [x] 2.1 Reemplazar el render de los cinco campos de texto
  (`objective`, `assessment`, `plan`, `treatment`, `notes`) en
  `src/components/admin/patient-record/PatientVisitsTab.tsx` por
  `<ExpandableText>` dentro del `<dd>` existente; "Subjetivo" (`<h4>`) sin
  cambios (D7).
- [x] 2.2 Smoke test de integración según `design.md` §4: la lista con una
  visita de texto largo muestra truncado + botón; el "Subjetivo" completo no
  genera botón.

## Fase 3 — Verificación

- [x] 3.1 `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` en
  verde.
- [x] 3.2 `verify-report.md` con el resultado de los checks y la cobertura de
  cada criterio de éxito del proposal.

## Fase 4 — Archivo y commit

- [x] 4.1 Work-unit commits convencionales (prueba+componente / integración /
  archivo SDD) en la rama del worktree.
- [x] 4.2 Mover `openspec/changes/ux-truncar-notas-evolucion/` a
  `openspec/changes/archive/2026-XX-XX-ux-truncar-notas-evolucion/` y fusionar
  el delta en `openspec/specs/clinical-record/spec.md`.
