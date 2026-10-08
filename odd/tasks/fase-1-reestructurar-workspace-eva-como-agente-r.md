# Feature: fase-1-reestructurar-workspace-eva-como-agente-r (issue #158)

**Issue:** https://github.com/proyecto-polaris-ia/medica-app/issues/158
**Branch:** `eliumontoya/fase-1-reestructurar-workspace-eva-como-agente-r`
**Creado:** 2026-12

## Contexto

Migración a topología multi-agente (épico #140). Eva se mueve de `agent/` a
`agents/eva/agent/` para exponerla en `/eva/eve/v1/*`. Mora permanece como
subagente de Eva temporalmente.

## Tareas

- [x] Mover todo el contenido de `agent/` a `agents/eva/agent/` con `git mv`
  (historial preservado, 26 archivos renombrados).
- [x] Actualizar imports relativos en tests (17 archivos), `knip.json` y
  comentarios que referenciaban las rutas viejas.
- [x] Actualizar webhook `/eve/v1/whatsapp` → `/eva/eve/v1/whatsapp` en
  `app/api/whatsapp/webhook/route.ts` + su test + docs operativas
  (`docs/eve-runbook.md`, `docs/whatsapp-agent-architecture.md`).
- [x] Validar: `tsc --noEmit` ✓, `npm run build` ✓, `npx eve build` ✓,
  `npx eve info` detecta el agente (App Root `agents/eva`, 21 tools,
  3 skills, 1 subagente, 0 diagnósticos) ✓, `npx eve dev` arranca ✓,
  `npm run test:local` 163 archivos / 1546 tests ✓ (tras `supabase db reset`).
- [x] Verificar ruta expuesta: `vercel/output/config.json` mapea
  `^/eva/eve/v1/(.*)$` al servicio `eve-eva`.

## Pendiente (manual, post-deploy)

- [ ] Prueba end-to-end de WhatsApp con mensaje real (requiere credenciales
  de producción). La URL pública del webhook de Meta (`/api/whatsapp/webhook`)
  no cambia; lo que cambió es el forward interno a `/eva/eve/v1/whatsapp`.

## Revisión nativa (RDD)

Dos ciclos de revisión nativa sobre este candidato:

1. Linaje `review-070fa23b09d92d7e` (estado pre-amend): **aprobada**, authority
   quemada. 6 hallazgos informativos.
2. Linaje `review-f0c4432cbfb12c88` (estado final tras amend del doc ODD,
   target `sha256:3c2cf0e9…`): **aprobada**, authority quemada
   (`gentle-ai.review-acknowledged/v1`). 5 hallazgos informativos no bloqueantes
   (seguimiento posterior, no reabren la revisión):

   - `R2-eva-eve-doc-diagram` — docs/whatsapp-agent-architecture.md:13-14 (sugerencia)
   - `R2-eva-eve-path-ambiguity` — app/api/whatsapp/webhook/route.ts:68 (sugerencia)
   - `R3-webhook-forward-target-not-proved-in-candidate` — route.ts:68 (warning)
   - `R3-webhook-url-assertion-containment-only` — route.test.ts:109 (sugerencia)
   - `R4-deploy-window-forward-404` — route.ts:68 (warning): durante la ventana de
     deploy el forward a la nueva ruta puede dar 404 hasta que el build nuevo esté
     activo.

   Nota de operación: el slot `review-reliability` fue rechazado dos veces por
   `binding_mismatch` del relay del host (bytes repetidos); un tercer intento
   produjo un resultado fresco válido.

Entrega por política ordinaria del repositorio (push/PR: decisión del usuario).

## Commits

- `757bc82` refactor(agent): move Eva to agents/eva/agent workspace layout
- `c9b9db2` feat(whatsapp): forward webhook to /eva/eve/v1/whatsapp
- `79e8019` docs(odd): track fase-1 workspace restructure feature tasks

## Notas

- `eve info` reporta el agente con identidad pública `eva` derivada del nombre
  del directorio `agents/eva/`, según `node_modules/eve/docs/guides/deployment/vercel.mdx`.
- Los artefactos generados (`agents/eva/.eve/`, `.vercel/`, `.next/`) están
  gitignoreados.
