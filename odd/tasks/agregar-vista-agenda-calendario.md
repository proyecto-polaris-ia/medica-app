# Feature: agregar-vista-agenda-calendario

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/176

## Tasks

- [x] 1. Explorar código de la vista Calendario en `/appointments` (MonthCalendar, CalendarNav, filtros #174, flujo de datos) — hallazgo clave: AgendaView ya existe (issue #175) como tercer botón de primer nivel; #176 = reestructurar como sub-vista (Opción A) + URL sync
- [x] 2. Crear change OpenSpec `agregar-vista-agenda-calendario` (proposal + specs + design + tasks) — 4 artefactos, 690 líneas, delta sobre capability `appointments-calendar-view`, forecast ~140–250 LOC, Decision needed: No
- [x] 3. Implementar sub-toggle Grilla/Agenda dentro de la vista Calendario — RED 23 fail / 66 pass; GREEN 89/89; tsc exit 0; page.tsx +132/−33, page.test.tsx +348/−40; 11 pruebas preexistentes de URL actualizadas por el contrato view/mode
- [ ] 4. Implementar vista de agenda (lista por día, agrupada, clic en cita/paciente, responsive)
- [ ] 5. Sincronizar modo (grilla/agenda) con la URL, sin peticiones extra al backend
- [ ] 6. Verificar: typecheck, lint, tests, build
- [ ] 7. Archivar change OpenSpec
- [ ] 8. Commit(s) por unidad de trabajo, push y PR (Closes #176)

## Notes

- Modo de persistencia: openspec (config.yaml presente, artifact_store: hybrid).
- Branch de trabajo: `eliumontoya/agregar-vista-de-agenda-lista-por-d-a-dentro-de` (worktree aislado; convención de branch del repo gana sobre skill).
- Fallback de skill: subagentes `sdd-*` no disponibles; se usan `gentle-ai-explore` / `gentle-ai-worker` / `gentle-ai-verify`.

## Evidence

- (por completar con hashes de commits por unidad de trabajo)
