# Feature: agregar-vista-agenda-calendario

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/176

## Tasks

- [x] 1. Explorar código de la vista Calendario en `/appointments` (MonthCalendar, CalendarNav, filtros #174, flujo de datos) — hallazgo clave: AgendaView ya existe (issue #175) como tercer botón de primer nivel; #176 = reestructurar como sub-vista (Opción A) + URL sync
- [x] 2. Crear change OpenSpec `agregar-vista-agenda-calendario` (proposal + specs + design + tasks) — 4 artefactos, 690 líneas, delta sobre capability `appointments-calendar-view`, forecast ~140–250 LOC, Decision needed: No
- [x] 3. Implementar sub-toggle Grilla/Agenda dentro de la vista Calendario — RED 23 fail / 66 pass; GREEN 89/89; tsc exit 0; page.tsx +132/−33, page.test.tsx +348/−40; 11 pruebas preexistentes de URL actualizadas por el contrato view/mode
- [x] 4. Vista de agenda (lista por día, clic en cita/paciente, responsive) — AgendaView.tsx reutilizada sin cambios (ya existía por #175); solo cambió el punto de montaje
- [x] 5. Sincronizar modo (grilla/agenda) con la URL, sin peticiones extra — ?view=calendar&mode=agenda, legacy ?view=agenda migrado, 0 refetch al alternar (tests 14.6/16.x)
- [x] 6. Verificar: typecheck, lint, tests, build — PASS: lint 0 errores (25 warnings preexistentes), 1793 tests / 0 fail, build exit 0; review nativa approved (4 hallazgos informativos)
- [x] 7. Archivar change OpenSpec — delta fusionado en openspec/specs/appointments-calendar-view/spec.md; carpeta movida a openspec/changes/archive/2026-10-09-agregar-vista-agenda-calendario/
- [ ] 8. Commit(s) por unidad de trabajo, push y PR (Closes #176) — commits hechos (eabf256, 188de68); push/PR en curso

## Notes

- Modo de persistencia: openspec (config.yaml presente, artifact_store: hybrid).
- Branch de trabajo: `eliumontoya/agregar-vista-de-agenda-lista-por-d-a-dentro-de` (worktree aislado; convención de branch del repo gana sobre skill).
- Fallback de skill: subagentes `sdd-*` no disponibles; se usan `gentle-ai-explore` / `gentle-ai-worker` / `gentle-ai-verify`.

## Evidence

- `eabf256` feat(appointments): add grid/agenda sub-toggle inside calendar view with URL persistence (7 archivos, +1225/−106)
- `188de68` docs(openspec): archive agregar-vista-agenda-calendario (5 archivos, +130/−18)
- Review nativa: lineage `review-7c05a30d3be9c133`, tier medium, lente review-reliability, estado approved, autoridad quemada (gentle-ai.review-acknowledged/v1)
