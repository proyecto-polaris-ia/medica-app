# Instrucciones para Agentes - Eve Migration

## Contexto General

Estamos migrando el agente de WhatsApp de medica-app a Vercel Eve framework. La migración está dividida en 7 etapas, cada una con su propio branch y issue.

**IMPORTANTE:** 
- Todos los PRs van hacia `feat/eve-migration` (NO hacia `main`)
- `main` debe permanecer intacto durante toda la migración
- Cada etapa depende de la anterior

## Estructura de Branches

```
main (intacto)
  └── feat/eve-migration (branch padre)
        ├── feat/eve-stage-1-setup          → Issue #31
        ├── feat/eve-stage-2-tools-read     → Issue #32
        ├── feat/eve-stage-3-tools-write    → Issue #33
        ├── feat/eve-stage-4-skills         → Issue #34
        ├── feat/eve-stage-5-channel        → Issue #35
        ├── feat/eve-stage-6-deploy         → Issue #36
        └── feat/eve-stage-7-cleanup        → Issue #37
```

---

## Instrucciones por Etapa

### Agente 1 - Stage 1: Setup Eve Framework

**Prompt para el agente:**

```
Vas a trabajar en el Issue #31 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/31
- Branch: feat/eve-stage-1-setup
- Plan completo: docs/eve/eve-migration-plan.md

Instrucciones:
1. Lee el issue #31 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-1/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-1/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-1/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-1/tasks.md)
   - Apply (implementa el código)
   - Verify (tests pasan)
   - Archive (documenta)
4. Haz commits en el branch feat/eve-stage-1-setup
5. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 1: Setup Eve Framework + Vercel KV" --body "Closes #31"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
```

---

### Agente 2 - Stage 2: Read Tools

**Prompt para el agente:**

```
Vas a trabajar en el Issue #32 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/32
- Branch: feat/eve-stage-2-tools-read
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stage 1 debe estar completo (Issue #31)

Instrucciones:
1. Lee el issue #32 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stage 1 esté completo (revisa agent/agent.ts existe)
4. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-2/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-2/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-2/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-2/tasks.md)
   - Apply (implementa las 3 tools de lectura)
   - Verify (tests pasan)
   - Archive (documenta)
5. Haz commits en el branch feat/eve-stage-2-tools-read
6. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 2: Add Eve Tools for Catalog, Availability, and Knowledge" --body "Closes #32"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Las tools son READ-ONLY (no modifican BD)
```

---

### Agente 3 - Stage 3: Write Tools

**Prompt para el agente:**

```
Vas a trabajar en el Issue #33 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/33
- Branch: feat/eve-stage-3-tools-write
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stages 1 y 2 deben estar completos

Instrucciones:
1. Lee el issue #33 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stages 1 y 2 estén completos
4. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-3/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-3/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-3/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-3/tasks.md)
   - Apply (implementa las 3 tools de escritura)
   - Verify (tests pasan, incluyendo integration tests)
   - Archive (documenta)
5. Haz commits en el branch feat/eve-stage-3-tools-write
6. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 3: Add Eve Tools for Booking and Patient Resolution" --body "Closes #33"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Las tools MODIFICAN la BD (write operations)
- Incluye integration tests para el flujo completo de booking
```

---

### Agente 4 - Stage 4: Skills

**Prompt para el agente:**

```
Vas a trabajar en el Issue #34 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/34
- Branch: feat/eve-stage-4-skills
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stages 1, 2 y 3 deben estar completos

Instrucciones:
1. Lee el issue #34 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stages 1-3 estén completos (tools existen)
4. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-4/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-4/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-4/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-4/tasks.md)
   - Apply (crea los 3 skills markdown)
   - Verify (skills se cargan correctamente)
   - Archive (documenta)
5. Haz commits en el branch feat/eve-stage-4-skills
6. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 4: Add Eve Skills for Booking Flow and Clinical Escalation" --body "Closes #34"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Skills son archivos markdown (NO código)
- Skills guían al agente en flujos conversacionales
```

---

### Agente 5 - Stage 5: WhatsApp Channel

**Prompt para el agente:**

```
Vas a trabajar en el Issue #35 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/35
- Branch: feat/eve-stage-5-channel
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stages 1-4 deben estar completos

Instrucciones:
1. Lee el issue #35 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stages 1-4 estén completos
4. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-5/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-5/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-5/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-5/tasks.md)
   - Apply (crea el canal WhatsApp con Chat SDK)
   - Verify (webhook verification, message flow)
   - Archive (documenta)
5. Haz commits en el branch feat/eve-stage-5-channel
6. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 5: Add Eve WhatsApp Channel with Chat SDK" --body "Closes #35"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Usa Chat SDK adapter (@chat-adapter/whatsapp)
- NO modifiques el webhook handler legacy todavía
```

---

### Agente 6 - Stage 6: Deploy + Feature Flag

**Prompt para el agente:**

```
Vas a trabajar en el Issue #36 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/36
- Branch: feat/eve-stage-6-deploy
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stages 1-5 deben estar completos

Instrucciones:
1. Lee el issue #36 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stages 1-5 estén completos
4. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-6/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-6/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-6/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-6/tasks.md)
   - Apply (implementa feature flag, routing, deploy)
   - Verify (testing en producción con feature flag)
   - Archive (documenta runbook)
5. Haz commits en el branch feat/eve-stage-6-deploy
6. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 6: Deploy Eve Agent to Production with Feature Flag" --body "Closes #36"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Feature flag permite rollback instantáneo
- Documenta runbook de monitoreo y rollback
```

---

### Agente 7 - Stage 7: Cleanup

**Prompt para el agente:**

```
Vas a trabajar en el Issue #37 del repositorio medica-app.

Contexto:
- Repo: https://github.com/proyecto-polaris-ia/medica-app
- Issue: https://github.com/proyecto-polaris-ia/medica-app/issues/37
- Branch: feat/eve-stage-7-cleanup
- Plan completo: docs/eve/eve-migration-plan.md
- DEPENDENCIA: Stages 1-6 deben estar completos Y Eve debe estar estable en producción

Instrucciones:
1. Lee el issue #37 completo para entender el scope
2. Lee docs/eve/eve-migration-plan.md para contexto general
3. Verifica que Stages 1-6 estén completos
4. Verifica que Eve esté estable en producción (al menos 1 semana)
5. Ejecuta el proceso SDD completo:
   - Proposal (openspec/changes/2026-09-XX-eve-stage-7/proposal.md)
   - Spec (openspec/changes/2026-09-XX-eve-stage-7/specs/feature-name/spec.md)
   - Design (openspec/changes/2026-09-XX-eve-stage-7/design.md)
   - Tasks (openspec/changes/2026-09-XX-eve-stage-7/tasks.md)
   - Apply (elimina código legacy, actualiza docs)
   - Verify (todos los tests pasan, build exitoso)
   - Archive (documenta)
6. Haz commits en el branch feat/eve-stage-7-cleanup
7. Crea PR hacia feat/eve-migration (NO hacia main):
   gh pr create --base feat/eve-migration --title "Stage 7: Remove Legacy WhatsApp Agent Code" --body "Closes #37"

IMPORTANTE:
- NO modifiques main
- NO crees PR hacia main
- Todos los PRs van hacia feat/eve-migration
- Sigue el flujo SDD estrictamente
- Elimina ~2000 líneas de código legacy
- Mantén src/lib/booking/ (lógica de negocio)
- Mantén WhatsApp Command Center UI
```

---

## Reglas Generales para Todos los Agentes

### ✅ HACER:
- Leer el issue completo antes de empezar
- Leer docs/eve/eve-migration-plan.md para contexto
- Seguir el proceso SDD estrictamente
- Trabajar en el branch correcto
- Crear PR hacia `feat/eve-migration`
- Incluir tests en cada stage
- Documentar decisiones en openspec/

### ❌ NO HACER:
- NO modificar main
- NO crear PR hacia main
- NO saltarse etapas del SDD
- NO trabajar en branches incorrectos
- NO eliminar código de stages anteriores
- NO modificar src/lib/booking/ (excepto Stage 7 si es necesario)

### 📋 Checklist por Stage:
1. [ ] Leer issue completo
2. [ ] Leer plan de migración
3. [ ] Verificar dependencias (stages anteriores)
4. [ ] Ejecutar SDD: Proposal → Spec → Design → Tasks
5. [ ] Implementar código (Apply)
6. [ ] Escribir tests
7. [ ] Verificar que tests pasan (Verify)
8. [ ] Documentar (Archive)
9. [ ] Commit en branch correcto
10. [ ] Crear PR hacia feat/eve-migration

---

## Orden de Ejecución

Los stages deben ejecutarse en orden debido a dependencias:

```
Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6 → Stage 7
```

**NO ejecutar en paralelo** porque cada stage depende del anterior.

---

## Después de Todos los Stages

Una vez que los 7 stages estén completos y mergeados a `feat/eve-migration`:

1. Crear PR final de `feat/eve-migration` hacia `main`
2. Review exhaustivo de todo el cambio
3. Merge a `main`
4. Deploy final a producción
5. Monitorear por 1-2 semanas
6. Celebrar la migración exitosa 🎉

---

## Soporte

Si tienes dudas:
- Revisa el issue correspondiente
- Revisa docs/eve/eve-migration-plan.md
- Revisa los openspec/changes/ de stages anteriores
- Pregunta al usuario antes de asumir
