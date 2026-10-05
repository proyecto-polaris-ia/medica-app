# Change: Métrica confiable de código muerto (deadcode)

## Why

Knip `6.39.0` reporta **105 issues** en el proyecto. La cifra es **ruidosa y poco
confiable**: mezcla falsos positivos de configuración (entradas y dependencias
que sí se usan, pero que Knip no puede resolver), dependencias y archivos
realmente muertos, y una mayoría de exports/tipos sin uso que nadie limpia
porque el reporte no es accionable.

Una métrica de código muerto que nadie puede usar no protege nada: el ruido
esconde la deuda real y desincentiva correr la herramienta. El objetivo es una
**métrica de deadcode confiable**, reproducible con `npx knip`, que reporte 0
(o casi 0) issues y cuya configuración explique por qué cada exclusión es
legítima.

Origen: issue [#130](https://github.com/proyecto-polaris-ia/medica-app/issues/130)
— "Mejorar métrica de deadcode".

## What Changes

Estrategia **mixta**: primero se corrige la configuración (falsos positivos),
luego se elimina lo genuinamente muerto y finalmente se codifica la convención
para que la métrica no vuelva a degradarse. Los hallazgos provienen de la
exploración previa del issue.

### 1. Correcciones de configuración en `knip.json`

- Quitar la entrada redundante `middleware.ts` de `entry`: el plugin de Next.js
  de Knip ya detecta el middleware.
- Agregar `"ignoreBinaries": ["supabase"]`: el Supabase CLI es global en el flujo
  de trabajo (ver `architecture.md` §9), por lo que no es una dependencia Node.
- Agregar `"ignoreDependencies": ["eslint-config-next"]`: se consume vía
  `FlatCompat` en `eslint.config.mjs:6`, forma que Knip no resuelve.
- Resolver el import de tipo `chat` no listado en `agent/channels/whatsapp.ts:3`
  con un mecanismo de dos capas: el shim ambiental existente
  `agent/eve-shim.d.ts:53` es la cobertura de tipos para `tsc`, y
  `"ignoreDependencies": ["chat"]` en `knip.json` suprime el issue `unlisted`
  que Knip reporta (Knip resuelve contra el manifiesto y no consulta
  declaraciones ambientales). **No** se agrega el paquete `chat`: `chat` no es
  una dependencia del manifiesto.

### 2. Dependencias realmente muertas

- `@chat-adapter/state-redis`: la decisión arquitectónica documentada en
  `openspec/changes/archive/2026-09-07-eve-stage-5/design.md:36` usa
  `@chat-adapter/state-memory`; Redis nunca se conectó.
- `ai-sdk-provider-opencode-sdk`: cero imports en el repo.

### 3. Archivos sin uso

Eliminar, **cada uno verificado con `grep` antes de borrar**:

- `app/api/admin/_lib/validate.ts`
- `src/lib/admin/metrics/index.ts`
- `src/lib/booking/index.ts`

### 4. Exports y tipos sin uso

- Eliminar o des-exportar los ~61 exports sin uso y ~45 tipos exportados sin uso,
  **ítem por ítem**, SOLO donde `grep` confirme cero uso en todo el repo
  (tests incluidos).
- Elemento usado únicamente dentro de su propio archivo → quitar la palabra
  clave `export`.
- Elemento con cero uso → eliminar.
- Conservar contratos compartidos intencionales (p. ej.
  `src/lib/whatsapp/inbound-decision.ts`) cuando la verificación muestre uso.

### 5. Codificar la convención

- Agregar `"ignoreExportsUsedInFile": true` a `knip.json` para que los exports
  usados dentro de su archivo dejen de contar.
- Proponer un script `"knip"` en `package.json` y un paso de CI. Este paso
  **SHOULD** ser no bloqueante sobre warnings (no corta el pipeline por
  `warnings`), para no convertir la limpieza en un portón frágil.

### Fuera de alcance

- No tocar `travelhub-app` (regla del repo).
- No refactors funcionales ni cambios de comportamiento en runtime.
- No eliminar exports que la verificación muestre en uso.
- No cambiar `next`, `react`, `eve` ni dependencias de runtime fuera de las dos
  muertas listadas.

## Capabilities

### New Capabilities

- `dead-code-metric` (dominio `code-quality`): define una métrica de código
  muerto **confiable y reproducible**. El reporte de Knip MUST reducirse a 0 (o
  casi 0, con cada excepción documentada) y MUST poder reproducirse con
  `npx knip`. Toda exclusión en `knip.json` (`entry`, `ignoreBinaries`,
  `ignoreDependencies`, `ignoreExportsUsedInFile`) MUST tener una justificación
  verificable en el repo. La eliminación o des-exportación de exports y tipos
  MUST basarse en evidencia de cero uso (grep, tests incluidos) y no en la sola
  presencia del reporte.

### Modified Capabilities

- Ninguna. Se evaluó `dependency-management` (dueña de la higiene de
  dependencias) y **no se modifica**: su alcance es auditoría de
  vulnerabilidades y overrides justificados, no la eliminación de dependencias
  sin uso. La remoción de las dos dependencias muertas es una consecuencia de la
  métrica nueva `dead-code-metric`, no un cambio de sus requisitos.

## Approach

- **Configuración primero.** Los falsos positivos se resuelven en `knip.json`
  antes de borrar nada, para que el reporte restante sea señal real.
- **Evidencia antes de borrar.** Cada archivo, export y tipo se confirma con
  `grep` (incluyendo `tests/`) antes de eliminarlo; el typecheck, lint, tests y
  build son la red de seguridad después.
- **Trabajo en unidades revisables.** Config → dependencias → archivos →
  exports/tipos → script y CI, cada bloque verificable por separado.
- **Convención explícita.** `ignoreExportsUsedInFile` y la justificación de cada
  ignore quedan documentados para que un falso positivo futuro no vuelva a
  inflar la métrica.
- **CI no bloqueante sobre warnings.** El paso de Knip informa regresiones sin
  frenar el pipeline por ruido.

## Decisions

| Decisión | Valor | Razón |
|---|---|---|
| Entrada `middleware.ts` | Quitar de `entry` | El plugin de Next.js de Knip ya detecta el middleware; la entrada era redundante. |
| Supabase CLI | `"ignoreBinaries": ["supabase"]` | Es una herramienta global (`architecture.md` §9), no una dependencia Node del proyecto. |
| `eslint-config-next` | `"ignoreDependencies"` | Se usa vía `FlatCompat` en `eslint.config.mjs:6`; Knip no resuelve ese patrón. |
| Tipo `chat` | Shim ambiental + `ignoreDependencies` | `agent/eve-shim.d.ts:53` cubre `tsc`; `"ignoreDependencies": ["chat"]` suprime el issue `unlisted` de Knip. No se agrega el paquete. |
| `@chat-adapter/state-redis` | Eliminar | Decisión de Stage 5 de usar `state-memory`; Redis nunca se configuró. |
| `ai-sdk-provider-opencode-sdk` | Eliminar | Cero imports. |
| Exports usados en su archivo | `ignoreExportsUsedInFile: true` | Dejan de contar sin forzar des-exportaciones artificiales. |
| Paso de CI | SHOULD, no bloqueante sobre warnings | Informa sin convertir la limpieza en un portón frágil. |

## Impacto

| Área | Impacto | Descripción |
|---|---|---|
| `knip.json` | Modificado | `entry` sin `middleware.ts`; `ignoreBinaries`, `ignoreDependencies` e `ignoreExportsUsedInFile`. |
| `package.json` | Modificado | Elimina `@chat-adapter/state-redis` y `ai-sdk-provider-opencode-sdk`; agrega script `knip`. |
| `package-lock.json` | Regenerado | Solo por `npm install` tras quitar las dos dependencias. |
| `app/api/admin/_lib/validate.ts` | Eliminado | Sin uso verificado con `grep`. |
| `src/lib/admin/metrics/index.ts` | Eliminado | Sin uso verificado con `grep`. |
| `src/lib/booking/index.ts` | Eliminado | Sin uso verificado con `grep`. |
| `src/`, `app/`, `agent/` | Modificado | Exports y tipos sin uso eliminados o des-exportados ítem por ítem. |
| `tests/` | Verificado | Los `grep` de uso incluyen tests; no se editan salvo que la eliminación lo exija. |
| CI (config de workflow) | Modificado | Paso de Knip no bloqueante sobre warnings (SHOULD). |
| `openspec/changes/mejorar-metrica-de-deadcode/**` | Creado | Artefactos SDD del cambio. |
| `travelhub-app` | Sin cambios | Regla crítica del repo. |

**Estado final esperado:** el reporte de Knip queda en **0 (o casi 0) issues**,
con cada excepción justificada, y es reproducible con `npx knip`.

## Rollback plan

Revertir los commits del cambio. Es una limpieza de configuración y código
muerto: no hay migraciones ni cambios de runtime. Restaurar `knip.json`,
`package.json`, `package-lock.json` y los archivos/exports eliminados desde
Git revierte por completo. No afecta el agente de WhatsApp, la reserva pública
ni la autenticación.

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Falso positivo: borrar un export realmente usado por entrada dinámica o re-export | Media | `grep` por item + `npx tsc --noEmit`, `npm run lint`, `npm run test` y `npm run build` después de cada bloque. |
| El shim de `chat` no cubre algún símbolo y Knip lo sigue marcando | Baja | No se agrega el paquete; si el shim no basta, se documenta como excepción y se reporta al orquestador. |
| La limpieza de ~61 exports y ~45 tipos es extensa y riesgosa en un solo commit | Media | Trabajo en unidades revisables (config → deps → archivos → exports → CI). |
| CI de Knip no bloqueante deja pasar regresiones | Baja | Decisión explícita (SHOULD); el reporte queda visible y la métrica se revisa en cada limpieza. |
| Eliminar `@chat-adapter/state-redis` rompe algo que sí lo importa | Baja | Cero imports confirmados y decisión de Stage 5 documentada; `npm install` + build lo validan. |

## Criterios de éxito

- [ ] `npx knip` reporta 0 (o casi 0) issues, con cada excepción documentada.
- [ ] Las 2 dependencias muertas eliminadas y sin imports en el repo.
- [ ] Los 3 archivos sin uso eliminados tras verificación con `grep`.
- [ ] Exports y tipos sin uso eliminados o des-exportados solo con evidencia de
      cero uso (tests incluidos).
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test` y `npm run build` pasan.
- [ ] `knip.json` justifica cada `entry`, `ignoreBinaries`, `ignoreDependencies` e
      `ignoreExportsUsedInFile`.
- [ ] Sin cambios en `travelhub-app`.
- [ ] El cambio está especificado con SDD/OpenSpec.
