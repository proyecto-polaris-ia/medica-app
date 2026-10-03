# Change: Lista diaria de pacientes a contactar (Clara ligera)

## Why

Hoy el consultorio depende de la memoria de la secretaria para saber a quién
hay que volver a llamar: pacientes que no se presentaron, tratamientos que
quedaron a medias, pacientes que no han vuelto en meses y presupuestos
presentados que nadie siguió. Los datos ya existen (citas con `no_show`,
`treatment_plans`, `clinical_visits`, `payments`), pero no hay una vista
determinista que los convierta en una lista de trabajo diaria.

Este cambio entrega la primera versión de "Clara" en su forma de **menor
riesgo**: una lista diaria determinista de pacientes a contactar en el panel
admin. **Sin agente autónomo y sin envío automático de mensajes**: solo reglas,
acciones manuales y borradores que un humano aprueba explícitamente. Se respeta
el principio arquitectónico del proyecto: el LLM interpreta y redacta, pero el
backend decide y ejecuta; nada se envía ni se agenda solo.

Cubre el issue [#89](https://github.com/proyecto-polaris-ia/medica-app/issues/89)
(fases 1, 2 y 3, decisión del usuario 2026-10-03) y complementa el expediente
consolidado (`clinical-record`, `treatment-plans`) ya entregado.

## What Changes

### Fase 1 — Reglas de segmentación (lib pura, testeable)

- Nuevo módulo puro `src/lib/admin/follow-up/` con cuatro segmentos
  configurables por umbrales:
  - **(a) No-shows recuperables:** citas en estado `no_show` dentro de los
    últimos **90 días** sin una cita posterior para el mismo paciente.
  - **(b) Tratamientos inconclusos:** planes de tratamiento en `in_progress`
    cuya última visita clínica tiene más de **45 días**.
  - **(c) Pacientes inactivos:** pacientes con cita histórica pero sin nueva
    cita en más de **6 meses**.
  - **(d) Presupuestos sin respuesta:** planes en `presented` hace más de
    **21 días** sin haber pasado a `accepted` ni a `cancelled`.
- **Deduplicación:** un paciente aparece una sola vez en la lista, con su
  motivo principal según una prioridad de segmentos definida.
- Umbrales como constantes configurables en código (`config.ts`); ver
  Decisions.
- Reglas puras (sin I/O ni relojes implícitos) para poder unit-testear casos
  borde: paciente con varios motivos, límites exactos de días y ausencia de
  citas/planes.

### Fase 2 — Página del panel con acciones manuales

- Nueva página `app/(admin)/follow-up/`: lista del día agrupada por motivo.
- Acciones por paciente:
  - **Marcar como contactado** (guarda la fecha).
  - **Agendar cita** (enlace al wizard existente `/appointments/new`).
  - **Descartar** el caso.
- **Persistencia del estado de contacto** por paciente y ronda, para no
  re-contactar dentro de la misma ronda.
- Ruta protegida por sesión como cualquier página admin; reutiliza
  `requireUser()` + `handleAdminRequest()` y el patrón de API admin existente.

### Fase 3 — Borradores de mensaje con aprobación humana

- Borrador de seguimiento por paciente, mostrado en el **WhatsApp Command
  Center** para aprobación humana.
- **Nunca envío automático.** El borrador se muestra y un humano decide
  enviarlo; el envío ocurre **solo tras aprobación explícita**, reutilizando el
  canal de WhatsApp del Command Center.
- Tono de recordatorio amable; sin diagnósticos, sin consejos clínicos y sin
  presión comercial.

## Impacto y capacidades

### New Capabilities

- `follow-up`: Lista diaria determinista de pacientes a contactar en el panel
  admin. Incluye la segmentación por motivo con umbrales configurables y
  deduplicación por paciente, el estado de contacto persistido por ronda, las
  acciones manuales (contactar / agendar / descartar) y el ciclo de vida del
  borrador de mensaje con aprobación humana (`draft → approved/rejected →
  sent/sent_failed`). Spec nueva en `openspec/specs/follow-up/spec.md`.

### Modified Capabilities

- **Ninguna.** El cambio es aditivo y reutiliza contratos existentes sin
  alterar su comportamiento observable: la página nueva queda cubierta por el
  requerimiento genérico "Protected admin routes" de `admin-panel`, y la Fase 3
  reutiliza el transporte saliente y el ledger de `whatsapp-inbound-automation`
  sin cambiar su contrato (el envío aprobado por humano es una escritura
  saliente más, con idempotencia por el ledger ya especificado).

| Área | Impacto | Descripción |
|---|---|---|
| `src/lib/admin/follow-up/` | New | Módulo puro de segmentación + capa de datos + tipos + config de umbrales. |
| `src/lib/admin/follow-up/config.ts` | New | Constantes configurables de umbrales (90 / 45 / 6 meses / 21 días) y prioridad de motivos. |
| `src/lib/admin/follow-up/__tests__/` | New | Pruebas unitarias de reglas, deduplicación y casos borde. |
| `app/(admin)/follow-up/` | New | Página de la lista diaria agrupada por motivo con acciones por paciente. |
| `app/api/admin/follow-up/` | New | Endpoints autenticados para estado de contacto y transiciones del borrador. |
| `supabase/migrations/0019_*.sql` | New | Tablas `follow_up_contacts` y `follow_up_message_drafts` + RLS patrón 0018. |
| `supabase/migrations/down/0019_*.down.sql` | New | Reversión ordenada (índices → tablas → tipos). |
| `src/components/admin/...` | New | Componentes de la lista del día y del borrador con aprobación. |
| `app/(admin)/whatsapp-command-center/` | Modified | Superficie de aprobación/envío del borrador de seguimiento. |
| `src/lib/whatsapp/store.ts` | Reused | Transporte saliente y ledger de mensajes (`whatsapp_messages`) para el envío aprobado. |
| `src/lib/admin/clinic-time.ts` | Reused | Presentación de fechas en `America/Mexico_City`. |
| `src/lib/admin/treatment-plans.ts` | Reused | Planes `in_progress` / `presented` para los segmentos (b) y (d). |
| `src/lib/admin/clinical-visits.ts` | Reused | Última visita clínica para el segmento (b). |

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Tablas nuevas | `follow_up_contacts` (estado de contacto por paciente/ronda) y `follow_up_message_drafts` (borradores con estados `draft → approved/rejected → sent/sent_failed`) | No existe hoy tabla de estado de contacto ni de borradores; se crean en la migración nueva `0019`. |
| Umbrales | Constantes configurables en `src/lib/admin/follow-up/config.ts` | No existe tabla de settings; la configurabilidad en BD queda como evolución futura fuera de alcance. |
| Antigüedad de "presentado hace N días" | `treatment_plans.updated_at` del plan | No existe `presented_at` en el esquema; evita inventar una columna en esta entrega. |
| RLS de tablas nuevas | Patrón de la migración `0018`: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL` de `anon` y `authenticated`, `GRANT` a `authenticated`, policy `*_admin_all FOR ALL TO authenticated USING (auth.uid() IS NOT NULL)` | El proyecto no tiene roles secretaria/doctor en RLS; el acceso es "cualquier usuario autenticado". |
| Convención de tiempo | Todo instante nuevo se persiste como `timestamptz`; presentación en `America/Mexico_City` | Aplica a `contacted_at` y cualquier instante persistido (convención del issue #89). |
| Envío | Solo tras aprobación humana explícita, vía el canal del Command Center | Nunca envío automático; guardrail de la entrega. |
| Capability OpenSpec | Nueva `follow-up` (spec dir `openspec/specs/follow-up/`) | Agrupa segmentación, estado de contacto y ciclo del borrador. |
| Entrega | PRs apilados por fase (patrón del issue #87) | Mantiene cada PR revisable y aislado por fase. |

## Fuera de alcance (Non-goals)

- Agente autónomo de Clara (razonamiento, priorización o conversación propia).
- Envío automático de cualquier mensaje o mensajería masiva.
- Tabla de settings / configuración de umbrales desde la interfaz.
- Diagnóstico, consejos clínicos, precios o disponibilidad por WhatsApp.
- Cambios al motor de reserva o al wizard `/appointments/new` (solo se enlaza).
- Cambios a Eva (`WHATSAPP_EVE_ENABLED`) y al path Eve conversacional.
- Cualquier modificación dentro de `travelhub-app` (regla crítica del repo:
  copiar + adaptar, nunca editar).

## Riesgos y plan de reversión

- **Riesgo — falsos positivos de segmentación:** un paciente se marca como
  "inactivo" o "no-show recuperable" sin serlo. Mitigación: umbrales
  configurables, reglas puras con casos borde unit-testeados y el descarte
  manual del caso.
- **Riesgo — lista excesiva y fatiga operativa:** mitigado por la deduplicación
  (un paciente aparece una vez) y el estado de contacto que evita re-contactar
  en la misma ronda.
- **Riesgo — borrador interpretado como envío:** mitigado por el ciclo de vida
  explícito del borrador (`draft → approved/rejected → sent/sent_failed`) y por
  exigir aprobación humana explícita antes de cualquier envío.
- **Riesgo — fuga de datos vía `anon` o service role en el cliente:**
  mitigación: RLS patrón 0018, `getSupabaseAdmin()` server-side only y
  `requireUser()` en toda ruta admin.
- **Rollback:** el cambio es aditivo (tablas y rutas nuevas; no altera tablas
  existentes). Revertir el commit por fase y ejecutar
  `supabase/migrations/down/0019_*.down.sql` (índices → tablas → tipos)
  restaura el estado previo sin pérdida de datos en tablas existentes.

## Criterios de éxito

- [ ] Las cuatro reglas de segmentación están unit-testeadas con casos borde
      (paciente con varios motivos, límites exactos de días, sin citas/planes).
- [ ] Un paciente no aparece duplicado entre segmentos; se muestra una vez con
      su motivo principal.
- [ ] La página `app/(admin)/follow-up/` lista los casos del día agrupados por
      motivo y ofrece marcar contactado, agendar cita y descartar.
- [ ] El estado de contacto se persiste y evita re-contactar al paciente en la
      misma ronda.
- [ ] El borrador de seguimiento se muestra en el Command Center y solo se
      envía tras aprobación humana explícita; nunca hay envío automático.
- [ ] Las tablas nuevas tienen RLS activa (patrón 0018) y son inaccesibles para
      `anon`.
- [ ] `npm run test`, `npx tsc --noEmit` y `npm run build` en verde.
