# Feature: clara-follow-up-draft-agent

Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/148
Épico: #140 (Fase 2 — separación de agentes). Base: #89 "Clara ligera".
SDD/OpenSpec: `openspec/changes/clara-follow-up-draft-agent/`
Persistencia: openspec (config.yaml: schema spec-driven, artifact_store hybrid, strict_tdd true)

## Tareas (ciclo SDD completo)

1. [ ] Explore — mapa de `src/lib/admin/follow-up/`, spec `follow-up`, flujo `whatsapp-command-center/follow-up-drafts`, panel `app/(admin)/follow-up/`
2. [x] Propose — `proposal.md` (con rollback plan)
3. [x] Spec — delta spec RFC 2119 + GWT, reutilizando spec `follow-up` (16 req / 48 escenarios) como invariante
4. [x] Design — superficie del agente (panel vs subagente interno vs job vs tool admin), reconciliar con decisión "sin agente autónomo" de #89
5. [x] Tasks — forecast de carga; gate de decisión si "Decision needed before apply: Yes"
6. [x] Apply — TDD estricto; datos contra Supabase local (`supabase start` + `db reset` + `npm run test:local`). Evidencia: 12 commits de unidad (ad302c5…791dc44), 3 slices, 22+43+21 tests nuevos en verde, suite completa 1227 passed.
7. [x] Verify — test + lint + build. Evidencia: PASS en `verify-report.md`; `npm run lint` sin errores (2 warnings nuevos de la change, corregidos)
8. [x] Archive — merge de deltas, mover a `archive/YYYY-MM-DD-clara-follow-up-draft-agent/`. Evidencia: deltas fusionados (3 MODIFIED en `follow-up`, 7 ADDED en `clara-drafting`); cambio movido a `openspec/changes/archive/2026-10-07-clara-follow-up-draft-agent/`
9. [x] Commit + push + PR — Closes #148. Evidencia: 15 commits de unidad; PRs apilados #151 (base main) → #152 (base #151) → #153 (base #152, Closes #148), etiquetados type:feature; issue de follow-up #154 (plantilla HSM con parámetro de cuerpo).

## Guardrails innegociables (del issue)

- Reglas de la lista 100% deterministas; el LLM NO participa en reglas ni deduplicación.
- El LLM solo redacta borradores y explica/prioriza el orden sugerido.
- Aprobación humana obligatoria; ningún envío automático ni masivo.
- Sin diagnósticos/consejo clínico, sin presión comercial, sin precios.
- Fuera de alcance: WhatsApp directo a Clara, envío automático, cambiar segmentación.

## Commits de unidad de trabajo

(registrar aquí los commit SHAs como evidencia)
