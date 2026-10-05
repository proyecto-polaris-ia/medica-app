# Design: Métrica confiable de código muerto (deadcode)

## Contexto y objetivo

Knip `6.39.0` reporta **105 issues** en `medica-app`: 3 archivos, 2
dependencias, 1 devDependency, 1 unlisted, 2 binarios, ~61 exports y ~45 tipos
exportados sin uso. La cifra mezcla falsos positivos de configuración con deuda
real. Este diseño fija **cómo** se lleva el reporte a **0 issues**, sin agregar
paquetes ni cambiar comportamiento de runtime, y deja documentada la
justificación de cada exclusión para que la métrica sea reproducible
(`npx knip`) y sostenible (script + CI).

Satisface la capability `dead-code-metric` de
`openspec/changes/mejorar-metrica-de-deadcode/specs/code-quality/spec.md`
(6 requisitos / 20 escenarios).

Fuera de alcance (propuesta, sección "Fuera de alcance"): cualquier cambio
funcional, `travelhub-app`, y las versiones *major* de `next`, `react` y `eve`.

## Evidencia verificada para este diseño

| Hecho | Evidencia en el repo |
|---|---|
| `middleware.ts` está duplicado en `entry` | `knip.json:7`; el plugin `next` de Knip ya lo marca como production entry (`node_modules/knip/dist/plugins/next/index.js`, patrón `{,src/}{instrumentation,instrumentation-client,middleware,proxy}.{js,jsx,ts,tsx}`) |
| `supabase` es un binario global, no una dependencia Node | `scripts/e2e-pretest.mjs:23,32,43` (`execSync('supabase …')`) y `package.json` scripts `db:start`/`db:reset`; `supabase` no está en `IGNORED_GLOBAL_BINARIES` de Knip 6.39.0 (`node_modules/knip/dist/constants.js:23`) |
| `eslint-config-next` se consume vía `FlatCompat` | `eslint.config.mjs:1` (import de `FlatCompat`), `:6` (construcción), `:9` (`...compat.extends("next/core-web-vitals", "next/typescript")`) |
| El import de tipo `chat` vive en un solo archivo | `agent/channels/whatsapp.ts:3` → `import type { Message, Thread } from "chat";` |
| El shim ambiental de `chat` existe | `agent/eve-shim.d.ts:53-60` (`declare module "chat"` con `Message` y `Thread`) |
| `chat` NO está en `package.json` y NO es *peer* de sus hosts | `node_modules/@chat-adapter/{whatsapp,shared,state-memory}/package.json` lo declaran en `dependencies` (`chat@4.34.0`). El fallback de Knip para dependencias hospedadas sólo considera **peerDependencies** (`node_modules/knip/dist/manifest/index.js:22-31`), así que no cubre `chat` |
| Las 2 dependencias muertas no tienen imports | `grep -rn "state-redis"` y `grep -rn "opencode-sdk"` sobre `app src agent scripts tests *.ts *.mts *.mjs` devuelven **sólo** `package.json:27` y `package.json:32` |
| Los 3 archivos a eliminar no tienen importadores | `grep -rn "_lib/validate" app src tests` → sólo `app/api/booking/_lib/validate.ts` (archivo distinto) y `app/api/admin/booking/book/route.ts:13`, que resuelve a `app/api/booking/_lib/validate`; `grep -rn "@/lib/booking\"\|'@/lib/booking'"` → 0; `grep -rn "@/lib/admin/metrics\"\|'@/lib/admin/metrics'"` → 0 |
| `agent/**` sí se analiza aunque no esté en `project` | El plugin `eve` de Knip 6.39.0 (enabler: dependencia `eve`) agrega `agent/{channels,tools,skills,…}/**/*.{ts,tsx,…}` como production entries (`node_modules/knip/dist/plugins/eve/index.js`) |
| Los tests son entries | Plugins `vitest` y `playwright` agregan `**/*.{test,spec}.?(c|m)[jt]s?(x)` como entries (`node_modules/knip/dist/plugins/{vitest,playwright}/index.js`) |

## Decisiones

### D1. Forma final exacta de `knip.json` (con una corrección de clave)

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "app/**/page.{ts,tsx}",
    "app/**/layout.{ts,tsx}",
    "app/**/route.{ts,tsx}",
    "scripts/**"
  ],
  "project": ["app/**", "src/**", "scripts/**", "tests/**"],
  "ignoreBinaries": ["supabase"],
  "ignoreDependencies": ["eslint-config-next", "chat"],
  "ignoreExportsUsedInFile": true
}
```

**Corrección respecto de la propuesta y del spec:** la clave `binaries` **no
existe** en el esquema de Knip `6.39.0`. El esquema raíz se valida con
`z.strictObject` (`node_modules/knip/dist/schema/configuration.js:36-64,89`) y
`createOptions` hace `knipConfigurationSchema.parse(loadedConfig)`
(`node_modules/knip/dist/util/create-options.js:59`); una clave desconocida
aborta la carga de configuración (Knip sale con código 2). Evidencia observada
al validar contra el esquema instalado:

```
binaries        => REJECTED: unrecognized_keys
ignoreBinaries  => ACCEPTED
final_shape     => ACCEPTED
```

`ignoreBinaries` es además la única clave que suprime el issue type `binaries`:
`removeIgnoredIssues()` aplica `handleIgnoredBinaries()` para `binaries`
(`node_modules/knip/dist/DependencyDeputy.js:346-353`). El resto de la forma
final fue validada contra el mismo esquema (`final_shape => ACCEPTED`).

Justificación de cada clave (requisito "Exclusiones de configuración
justificadas y verificables"):

| Clave | Valor | Por qué es legítimo | Evidencia |
|---|---|---|---|
| `$schema` | `knip@6/schema.json` | autocompletado y validación del editor; no suprime hallazgos | esquema publicado |
| `entry` `app/**/page\|layout\|route.{ts,tsx}` | explícito | Entradas de App Router; el plugin `next` también las detecta, pero se conservan explícitas para que el set de entradas no dependa de un plugin | `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/route.ts` |
| `entry` `scripts/**` | explícito | Los scripts (`scripts/e2e-pretest.mjs`, `scripts/whatsapp-simulate-inbound.mjs`) son ejecutables del flujo y son entradas reales | `scripts/` |
| `middleware.ts` **fuera** de `entry` | eliminado | Redundante: el plugin `next` agrega `middleware.{js,jsx,ts,tsx}` como production entry; el archivo sigue analizado | `knip.json:7` hoy; plugin `next` |
| `project` | sin cambios | `app/**`, `src/**`, `scripts/**`, `tests/**`; `agent/**` entra por el plugin `eve`, no necesita `project` | plugin `eve` |
| `ignoreBinaries` | `["supabase"]` | El Supabase CLI es una herramienta **global** del flujo (no una dependencia Node del proyecto) y no está en la allowlist `IGNORED_GLOBAL_BINARIES` de Knip | `scripts/e2e-pretest.mjs:23,32,43`; `architecture.md` §9 |
| `ignoreDependencies` | `"eslint-config-next"` | Se consume indirectamente vía `FlatCompat`, patrón que el resolvedor de Knip no sigue | `eslint.config.mjs:1,6,9` |
| `ignoreDependencies` | `"chat"` | Import de **tipo** cubierto por shim ambiental para `tsc`; Knip lo clasifica como `unlisted` porque `chat` no es dependencia del manifiesto. Ver D2 | `agent/channels/whatsapp.ts:3`; `agent/eve-shim.d.ts:53` |
| `ignoreExportsUsedInFile` | `true` | Un export usado dentro de su propio archivo no es código muerto; evita des-exportaciones artificiales | requisito "Exclusiones de configuración justificadas" |

**Formato del archivo:** `knip.json` es JSON estricto (Knip lo carga con
`loadJSON`; los comentarios sólo se permiten en `.jsonc`/`.json5`,
`node_modules/knip/dist/util/loader.js:32-37`). La justificación vive en este
`design.md` como **documentación referenciada** (admitido por el requisito).
Alternativa evaluada y rechazada: renombrar a `knip.jsonc` para meter
comentarios inline; la propuesta fija la ruta `knip.json` y el rename agrega
churn sin cambio de comportamiento.

### D2. Tipo `chat`: el shim cubre `tsc`; `ignoreDependencies` cubre Knip

Pregunta de diseño: ¿`declare module "chat"` en `agent/eve-shim.d.ts:53` basta
para que Knip no reporte el import?

**No basta.** El shim sólo aporta tipos a TypeScript. Knip resuelve
especificadores contra el sistema de archivos y el `package.json` (no consulta
declaraciones ambientales de `.d.ts`), y cuando un especificador "parece
paquete" pero no está en el manifiesto lo clasifica como `unlisted`
(`node_modules/knip/dist/graph/build.js:361-368` → `addIssue({type:'unlisted'})`
en `dist/graph/analyze.js:236`). Evidencia empírica adicional: el shim ya
existe hoy y el reporte igual cuenta **1 unlisted** (`chat`), que es el único
especificador externo no listado en todo el repo (barrido de imports sobre
`app/`, `src/`, `agent/`, `scripts/`, `tests/`).

**Mecanismo elegido (0 issues, sin agregar el paquete):**

- `agent/channels/whatsapp.ts` y `agent/eve-shim.d.ts` **no se tocan**: el shim
  sigue siendo lo que mantiene `npx tsc --noEmit` en verde.
- `knip.json` agrega `"chat"` a **`ignoreDependencies`** (clave exacta; ver D1).
  `removeIgnoredIssues()` aplica `handleIgnoredDependencies(..., 'unlisted')`,
  que hace match del nombre de paquete contra `ignoreDependencies`
  (`node_modules/knip/dist/DependencyDeputy.js:248-288` y `:350`).

Alternativas evaluadas y rechazadas:

| Alternativa | Por qué se rechaza |
|---|---|
| Agregar `chat` a `package.json` | Prohibido explícitamente por el spec ("MUST NOT agregarse el paquete `chat` a `package.json`") |
| `ignoreUnresolved: ["chat"]` | No aplica: `chat` nunca cae en `issues.unresolved` (el analizador lo mueve a `external`/`unlisted`), y `handleIgnoredUnresolved()` sólo mira `issues.unresolved` (`dist/DependencyDeputy.js:318-344`) |
| Cambiar el import a una ruta relativa a un `.d.ts` local | Rompe el requisito de que el import quede cubierto por el shim `agent/eve-shim.d.ts:53` y duplica tipos |
| `ignore: ["agent/channels/whatsapp.ts"]` | Ocultaría todo el archivo (sus exports reales y sus dependencias), no sólo el falso positivo |
| `paths` de `tsconfig` mapeando `chat` a un archivo local | Cambia la resolución para `tsc` y para Next; mayor riesgo que un ignore documentado |

Verificación obligatoria para Apply: tras aplicar, `npx knip` MUST consumir el
ignore (no debe aparecer "Unused item in ignoreDependencies: chat"). Si Knip lo
reportara como ignore no usado, significa que el shim sí bastó: en ese caso se
quita `"chat"` de `ignoreDependencies` y se deja constancia en el
`verify-report.md`. Este diseño asume el caso medido (ignore necesario).

### D3. Retiro de dependencias

Líneas exactas a eliminar en `package.json` (bloque `dependencies`):

| Línea | Contenido a borrar | Razón |
|---|---|---|
| `package.json:27` | `"@chat-adapter/state-redis": "^4.34.0",` | Sustituida por `@chat-adapter/state-memory` en la decisión de Stage 5 (`openspec/changes/archive/2026-09-07-eve-stage-5/design.md`, sección "State Adapter Decision"); Redis nunca se configuró y no existe `REDIS_URL` |
| `package.json:32` | `"ai-sdk-provider-opencode-sdk": "^3.0.6",` | Cero imports en el repo |

Pasos exactos:

1. Borrar las dos líneas (borrado de línea completa, sin tocar `@chat-adapter/state-memory` ni `@ai-sdk/openai-compatible`).
2. `npm install` — regenera `package-lock.json` y poda `node_modules`. Único paso permitido de regeneración.
3. **No** ejecutar `npm audit fix`, `npm audit fix --force`, `npm update` ni ninguna instalación manual por paquete.

Restricciones que impone `openspec/specs/dependency-management/spec.md`:

- El lockfile se regenera **sólo** con `npm install` (requisito "Sin incrementos
  de versión mayor…", escenario "Prohibición de arreglos forzados").
- `next`, `eve` y `react`/`react-dom` conservan su *major* (`15.x`, `0.52.x`,
  `19.0.0`); este cambio no toca esas entradas.
- `npm audit` MUST seguir en 0 vulnerabilidades: el retiro no agrega
  vulnerabilidades, pero se corre `npm audit` como comprobación extra al cierre.

Nota de alcance: eliminar `@chat-adapter/state-redis` **no** elimina
`node_modules/chat`, porque `@chat-adapter/whatsapp` y
`@chat-adapter/state-memory` también dependen de `chat@4.34.0`. Es decir, el
ignore de D2 sigue siendo necesario después del retiro.

### D4. Eliminación de archivos

Tres archivos, cada uno verificado con `grep` (incluyendo `tests/`) **antes** de
borrar. Comando de verificación por archivo y resultado esperado:

| Archivo | Comando de verificación | Resultado que autoriza el borrado |
|---|---|---|
| `app/api/admin/_lib/validate.ts` | `grep -rn "_lib/validate" app src agent scripts tests` | Sólo los importadores de `app/api/booking/_lib/validate.ts` (archivo homónimo en otra carpeta) y rutas relativas que resuelven a él. Cero referencias a `app/api/admin/_lib/` |
| `src/lib/admin/metrics/index.ts` | `grep -rn "@/lib/admin/metrics\"\|'@/lib/admin/metrics'" app src agent scripts tests` | 0 coincidencias. Los consumidores importan submódulos (`@/lib/admin/metrics/loader`, `/trend`, `/transitions`, `/types`) |
| `src/lib/booking/index.ts` | `grep -rn "@/lib/booking\"\|'@/lib/booking'" app src agent scripts tests` | 0 coincidencias. Los consumidores importan módulos directos (`@/lib/booking/availability`, etc.) |

Procedimiento por archivo: (1) correr el grep, (2) confirmar el resultado
esperado, (3) `git rm`-equivalente (borrado del archivo en el árbol de trabajo),
(4) `npx tsc --noEmit` + `npm run build`. Si el grep muestra uso ≠ 0, **no se
borra**: se registra como contrato compartido y se documenta la excepción
(requisito "Eliminación basada en evidencia de cero uso").
`app/api/admin/_lib/validate.ts` es un barril puro que re-exporta
`@/lib/admin/validate`; si en el futuro se necesita, se recupera desde Git.

### D5. Limpieza de exports y tipos: plan por lotes

Alcance: los ~61 exports y ~45 tipos sin uso que reporte `npx knip` (los
números exactos y su archivo declarante salen del reporte vigente al arrancar
cada lote, `npx knip --reporter json` si hace falta).

Procedimiento **por símbolo** (requisito "Eliminación basada en evidencia de
cero uso"):

a. `grep -rn -w "<Symbol>" app src agent scripts tests middleware.ts` (y buscar
   también el path del archivo declarante para detectar barriles
   `export * from './x'`).
b. Decisión:
   - Únicamente referencias dentro del archivo declarante → **quitar `export`**
     (`export const` → `const`, `export interface` → `interface`,
     `export type`/`function`/`class`/`enum` idem). Si la referencia es un
     re-export del propio archivo (`export { X }`), quitar el elemento de la
     lista; si es `export * from './x'`, quitar la línea.
   - Cero referencias en todo el repo → **eliminar la declaración**.
   - Referencias fuera del archivo declarante → **conservar** y registrar el
     uso (contrato compartido intencional; el spec nombra
     `src/lib/whatsapp/inbound-decision.ts` como ejemplo a conservar si la
     verificación muestra uso).
c. Cierre de lote: `npx tsc --noEmit`, `npm run lint`, `npm run test` y
   `npm run build` deben pasar, y `npx knip` debe haber **bajado** el conteo del
   lote sin aumentar el total (requisito "Bloque de limpieza sin regresiones").
   Los cuatro comandos se corren por lote (la spec lo exige por bloque); si el
   orquestador prefiere agrupar lotes para no correr 12 builds, los grupos se
   documentan en `tasks.md` y los cuatro comandos se corren igualmente al
   cerrar cada grupo, con los lotes del grupo listados.

Lotes propuestos (por directorio, en este orden):

| # | Lote | Archivos representativos |
|---|---|---|
| 1 | `app/api/admin/**` | rutas admin, `_lib/`, incluye el borrado de `app/api/admin/_lib/validate.ts` |
| 2 | UI admin y páginas | `app/(admin)/**` (dashboard y sus `components/`, páginas de pacientes/citas/pagos) y `app/**` restante |
| 3 | `src/lib/admin/**` (sin `metrics/`) | `admin/follow-up/**`, `admin/patient-files.ts`, `admin/treatment-plans.ts`, `admin/patients.ts`, `admin/payments.ts`, `admin/providers.ts`, `admin/types.ts`, … |
| 4 | `src/lib/admin/metrics/**` | `aggregate.ts`, `no-show.ts`, `occupancy.ts`, `range.ts`, `transitions.ts`, `trend.ts`, `types.ts` + borrado del barril `metrics/index.ts` |
| 5 | `src/lib/booking/**` | `availability.ts`, `booking.ts`, `booking-state.ts`, `catalog.ts`, `next-available.ts`, `patient-resolution.ts`, `types.ts` + borrado del barril `booking/index.ts` |
| 6 | `src/lib/citas/**` | `appointment-status.ts`, `reminder-reply*.ts`, `send-appointment-reminder.ts`, `send-onboarding-nudge.ts` |
| 7 | `src/lib/follow-up/**` + `src/lib/observability/**` | `send-follow-up-draft.ts`; `debug-logger.ts`, `whatsapp-ai.ts` |
| 8 | `src/lib/wcc-*.ts` | `wcc-appointments.ts`, `wcc-client.ts`, `wcc-contacts.ts`, `wcc-conversations.ts`, `wcc-dashboard.ts`, `wcc-escalations.ts`, `wcc-follow-up-drafts.ts`, `wcc-knowledge.ts`, `wcc-payments.ts` |
| 9 | `src/lib/whatsapp/**`, `src/lib/web-chat/**`, `src/lib/ai/**`, `src/lib/flows/**`, `src/lib/payments/**`, `src/lib/supabase/**` | conservar explícitamente lo que el grep muestre en uso (p. ej. `whatsapp/inbound-decision.ts`) |
| 10 | `agent/**` y `scripts/**` | `agent/tools/**`, `agent/channels/whatsapp.ts`, `agent/trusted-contact-context.ts`; `scripts/e2e-pretest.mjs`, `scripts/whatsapp-simulate-inbound.mjs` |
| 11 | `tests/**` | incluye `tests/e2e/helpers/{booking,db}.ts`; **los exports marcados por Knip se tratan igual**: el grep incluye `tests/` y los `*.spec.ts` (que son entries por los plugins `vitest`/`playwright`) |
| 12 | Cierre | remanentes en `app/**`, `src/**`, raíz (`middleware.ts`) y recuento final `npx knip` = 0 issues |

Regla para barriles que queden vacíos (p. ej. si a un `index.ts` se le quitan
todas sus líneas): es un **borrado de archivo no enumerado** en la propuesta.
No se borra sin autorización: se registra el caso y se pide decisión al
orquestador (ver "Decisiones abiertas").

### D6. Métrica sostenida: script y CI

**Script (`package.json`)**: insertar la entrada entre `typecheck` y `sanity`
(después de `package.json:19`):

```json
    "knip": "knip",
```

Queda disponible como `npm run knip` (equivalente exacto de `npx knip`).

**CI (`.github/workflows/ci.yml`)**: el único workflow es `ci.yml`. El paso va
en el job **`test`**, después de `Typecheck` (reutiliza el `npm ci` ya hecho y
no duplica instalación):

```yaml
      - name: Dead code (knip)
        # Métrica de código muerto. Knip 6 sale con código 1 sólo cuando hay
        # issues (maxIssues=0); los configuration/tag hints (warnings) no
        # cambian el exit code salvo treatConfigHintsAsErrors/treatTagHintsAsErrors,
        # que no se fijan. Así el paso falla por regresiones reales y nunca
        # sólo por warnings.
        run: npm run knip
```

Mecanismo elegido: **paso normal, sin `continue-on-error` ni
`--no-exit-code`**. Evidencia: `node_modules/knip/dist/cli.js:62-67` sólo asigna
`process.exitCode = 1` cuando `totalErrorCount > maxIssues` o cuando
`treatConfigHintsAsErrors`/`treatTagHintsAsErrors` están activos (default:
`false`). Es decir, Knip ya distingue "issues" de "warnings" (configuration
hints y tag hints) en su exit code: el paso falla por issues y nunca sólo por
warnings, que es exactamente lo que pide el requisito "Paso de CI no bloqueante
sobre warnings" (y "preferir fallar sólo por issues"). Rechazados:
`continue-on-error: true` y `--no-exit-code` (ambos ocultarían regresiones
reales de la métrica). Alternativa considerada: un job `deadcode` separado;
rechazado por duplicar `npm ci` en cada corrida.

Prerequisito de CI: `package-lock.json` regenerado (D3), porque el job usa
`npm ci`.

### D7. TDD y verificación: aplicabilidad

`openspec/config.yaml` tiene `testing.strict_tdd: true` y `apply.tdd: true`.
Este cambio es **preservación de comportamiento**, no hay test unitario que
exprese "el código muerto fue eliminado": el contrato observable es la métrica
(`npx knip`) más la no regresión de las suites existentes. Se documenta la
excepción de aplicabilidad RED/GREEN y se sustituye por verificación
determinista por comando (D5.c). Equivalente conceptual: **RED** = el reporte
de Knip con el lote pendiente (issues > 0), **GREEN** = 0 issues con
`npx tsc --noEmit`, `npm run lint`, `npm run test` y `npm run build` en verde.
No se inventan pruebas artificiales sobre código muerto.

## Plan de verificación

Prerequisito local (sólo para `test:local`): `supabase start` +
`supabase db reset` (`architecture.md` §9; `openspec/changes/supabase-local-testing/`).

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `npx knip` | `0 issues` (exit 0). Cualquier issue remanente debe estar justificado en `knip.json` + este design; sin justificación es defecto |
| 2 | `npx tsc --noEmit` | exit 0, sin errores (incluye el import de tipo `chat` resuelto por `agent/eve-shim.d.ts:53`) |
| 3 | `npm run lint` | exit 0 |
| 4 | `supabase start` → `supabase db reset` → `npm run test:local` | Todas las suites en verde, incluidas las de datos |
| 5 | `npm run build` | build de Next exitoso |
| 6 | `npm audit` | `found 0 vulnerabilities` (constraint de `specs/dependency-management`) |

Sobre `test:local` vs un subconjunto: los lotes 3–9 tocan módulos de datos
(`src/lib/admin/**`, `src/lib/booking/**`, `src/lib/citas/**`, `src/lib/wcc-*`,
`src/lib/whatsapp/**`) cuyas suites sólo corren con `SUPABASE_LOCAL=1`. Por eso
la corrida completa `npm run test:local` es el requisito de cierre. Si al
cerrar la limpieza la evidencia (`grep` + lista de archivos tocados) muestra
que **ningún** export/tipo se removió de los módulos listados en
`architecture.md` §9, entonces `npm run test` (sin Docker) es suficiente y la
corrida con base local MAY sustituirse por una suite dirigida; esa excepción se
documenta con la evidencia del grep en `verify-report.md`.

Durante los lotes, `npm run test` (sin `SUPABASE_LOCAL`) da retroalimentación
rápida; el cierre siempre corre el conjunto acordado arriba.

## Rollback

- Revertir los commits del cambio en `chore/mejorar-metrica-de-deadcode`
  (o descartar la rama si aún no se integra). `git revert` restaura
  `knip.json`, `package.json`, `package-lock.json`, los 3 archivos eliminados y
  los exports/tipos removidos, todo desde Git.
- Tras revertir `package.json`, regenerar dependencias con `npm install` para
  reinstalar `@chat-adapter/state-redis` y `ai-sdk-provider-opencode-sdk`.
- **No hay migraciones ni cambios de datos**: nada que revertir en Supabase.
- **No hay cambios de runtime, env ni infraestructura**: el agente de WhatsApp,
  la reserva pública y la autenticación no se tocan.
- Estado tras el rollback: `npx knip` vuelve a reportar el conteo previo (~105
  issues).

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| La clave `binaries` de la propuesta/spec es inválida y abortaría la carga de `knip.json` | Alta (confirmada) | Este diseño usa `ignoreBinaries` y abre la corrección del spec (ver abajo) |
| `ignoreDependencies: ["chat"]` enmascara un issue legítimo futuro | Baja | Es un ignore de un solo paquete, documentado con evidencia (D2) y verificado en el paso de CI |
| Borrar un export usado por import dinámico o lookup por string | Media | `grep` por símbolo + `tsc` + `build` + suites por lote; conservar los contratos con uso confirmado |
| Un barril queda vacío tras quitar sus re-exports y hace falta borrar un archivo no enumerado | Media | No se borra sin autorización; se escala (ver abajo) |
| `npm install` altera versiones más allá del retiro | Baja | `git diff package-lock.json` limitado a las dos dependencias; el spec prohíbe `audit fix --force` y cambios de major |
| `npx knip` difiere entre local y CI | Baja | Mismo `package-lock.json` y `knip.json` versionado; CI corre `npm ci` y `npm run knip` |

## Decisiones abiertas (Apply / orquestador)

1. **`binaries` → `ignoreBinaries`.** El spec aprobado dice literalmente que
   `binaries` MUST contener `supabase` (Requisito "Exclusiones de configuración
   justificadas y verificables", escenario "Entradas de binaries e
   ignoreDependencies"). Esa clave no existe en Knip 6.39.0. Requiere un delta
   `MODIFIED` en `specs/code-quality/spec.md` (y ajuste de la tabla de
   decisiones de `proposal.md`) antes de archivar. El orquestador debe
   autorizarlo; este diseño ya usa la clave válida.
2. **`chat` vía `ignoreDependencies`.** El spec pide que "la cobertura del shim
   MUST ser suficiente para que Knip y tsc no reporten ese import". Lo medido:
   el shim cubre `tsc`; Knip exige además una exclusión justificada
   (`ignoreDependencies`). Requiere matiz en el mismo delta del spec.
3. **Barriles vacíos.** Si al quitar re-exports un `index.ts` (distinto de los 3
   archivos enumerados) queda sin declaraciones, decidir entre borrarlo o
   dejarlo con un comentario; el diseño no lo autoriza por sí solo.
4. **Alcance de pruebas de cierre.** Confirmar si `npm run test:local` (con
   Supabase local) sustituye a un subconjunto cuando el grep demuestre que no se
   tocaron módulos de datos.
