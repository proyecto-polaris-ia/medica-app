# Delta para `dead-code-metric` (dominio `code-quality`)

Nueva capability. Hasta ahora no existe una métrica de código muerto confiable:
Knip `6.39.0` reporta 105 issues que mezclan falsos positivos de configuración,
dependencias y archivos realmente muertos, y exports/tipos sin uso. Este delta
define la métrica observable, su reproducibilidad y la evidencia exigida antes
de borrar o des-exportar cualquier símbolo.

## ADDED Requirements

### Requirement: Reporte reproducible de código muerto

La métrica de código muerto SHALL obtenerse ejecutando `npx knip` sobre el
repositorio, sin flags adicionales, usando el `knip.json` versionado. Al cerrar
este cambio el reporte MUST quedar en **0 issues**. Cualquier issue remanente
MUST estar contado y justificado de forma explícita en el repositorio; un issue
sin justificación MUST tratarse como defecto. Dada la misma revisión de código y
el mismo `package-lock.json`, la ejecución local y la de integración continua
MUST producir el mismo conjunto de issues.

#### Scenario: Reporte limpio al cerrar el cambio

- GIVEN el cambio `mejorar-metrica-de-deadcode` aplicado por completo
- WHEN se ejecuta `npx knip` en la raíz del repositorio
- THEN el reporte MUST indicar 0 issues
- AND cada excepción documentada MUST aparecer como justificación en el repo, no como issue del reporte

#### Scenario: Resultado idéntico en local y en CI

- GIVEN la misma revisión y el mismo `package-lock.json`
- WHEN se ejecuta `npx knip` en la máquina local y en el pipeline de CI
- THEN ambos MUST reportar el mismo conjunto de issues
- AND ninguna diferencia MUST atribuirse a configuración no versionada

#### Scenario: Aparición de un issue nuevo

- GIVEN una revisión posterior que introduce un export, archivo o dependencia sin uso
- WHEN se ejecuta `npx knip`
- THEN el reporte MUST listar el elemento nuevo
- AND el equipo MUST resolverlo o justificarlo antes de considerarlo excepción válida

### Requirement: Exclusiones de configuración justificadas y verificables

Cada clave de exclusión en `knip.json` que suprime un hallazgo MUST tener una
justificación verificable dentro del repositorio (comentario en el archivo o
documentación referenciada). Una exclusión sin justificación SHOULD tratarse
como defecto, no como configuración válida. En particular:

- `entry` MUST NOT incluir `middleware.ts`, porque el plugin de Next.js de Knip
  ya detecta el middleware.
- `ignoreBinaries` MUST declarar `["supabase"]`, porque el Supabase CLI es una
  herramienta global del flujo de trabajo (`architecture.md` §9), no una
  dependencia Node del proyecto.
- `ignoreDependencies` MUST declarar `["eslint-config-next"]`, consumido vía
  `FlatCompat` en `eslint.config.mjs:6`, patrón que Knip no resuelve.
- `ignoreExportsUsedInFile` MUST quedar en `true`, para que los exports usados
  dentro de su propio archivo dejen de contar sin forzar des-exportaciones
  artificiales.

#### Scenario: Exclusión con justificación verificable

- GIVEN una clave de exclusión en `knip.json` que suprime un hallazgo
- WHEN se revisa esa clave
- THEN el repositorio MUST contener un comentario o documento que explique por qué la exclusión es legítima
- AND la justificación MUST referenciar evidencia concreta del repo (archivo, línea o sección)

#### Scenario: Exclusión sin justificación

- GIVEN una clave de exclusión en `knip.json` sin comentario ni documentación asociada
- WHEN se audita el `knip.json`
- THEN esa exclusión SHOULD registrarse como defecto
- AND MUST NOT considerarse parte de la métrica confiable

#### Scenario: `middleware.ts` fuera de `entry`

- GIVEN el `knip.json` del cambio aplicado
- WHEN se inspecciona la lista `entry`
- THEN `middleware.ts` MUST NOT aparecer
- AND el middleware MUST seguir siendo analizado por el plugin de Next.js de Knip

#### Scenario: Entradas de `ignoreBinaries` e `ignoreDependencies`

- GIVEN el `knip.json` del cambio aplicado
- WHEN se inspeccionan `ignoreBinaries` e `ignoreDependencies`
- THEN `ignoreBinaries` MUST contener `supabase`
- AND `ignoreDependencies` MUST contener `eslint-config-next`
- AND `ignoreExportsUsedInFile` MUST ser `true`

### Requirement: Eliminación basada en evidencia de cero uso

Eliminar o des-exportar un símbolo, archivo o dependencia marcado por Knip MUST
requerir verificación previa de cero uso mediante `grep` sobre `app/`, `src/`,
`agent/`, `scripts/` y `tests/`. Un símbolo reportado por Knip MUST NOT
eliminarse con la sola presencia del reporte como evidencia. Los contratos
compartidos intencionales MUST conservarse cuando la verificación muestre uso.
Elemento usado únicamente dentro de su propio archivo MUST des-exportarse (quitar
`export`) en lugar de eliminarse; elemento con cero uso en todo el repo MUST
eliminarse. Después de cada bloque de limpieza, `npx tsc --noEmit`, `npm run
lint`, `npm run test` y `npm run build` MUST pasar.

#### Scenario: Verificación antes de borrar

- GIVEN un símbolo marcado por Knip como sin uso
- WHEN se planea eliminarlo o des-exportarlo
- THEN MUST ejecutarse `grep` sobre `app/`, `src/`, `agent/`, `scripts/` y `tests/`
- AND el resultado MUST confirmar cero uso antes de tocar el archivo

#### Scenario: Uso confirmado conserva el símbolo

- GIVEN un contrato compartido reportado por Knip (por ejemplo `src/lib/whatsapp/inbound-decision.ts`)
- WHEN el `grep` de verificación muestra uso en el repositorio
- THEN el símbolo MUST conservarse
- AND MUST NOT eliminarse ni des-exportarse

#### Scenario: Bloque de limpieza sin regresiones

- GIVEN un bloque de exports, tipos, archivos o dependencias eliminados con evidencia de cero uso
- WHEN se ejecutan `npx tsc --noEmit`, `npm run lint`, `npm run test` y `npm run build`
- THEN los cuatro comandos MUST completarse sin errores nuevos
- AND el número de issues de `npx knip` MUST NOT aumentar respecto del bloque anterior

### Requirement: Retiro de dependencias y archivos genuinamente muertos

Las dependencias y archivos confirmados sin uso MUST eliminarse como parte de la
métrica, sin afectar dependencias de runtime fuera de las confirmadas. La
remoción de una dependencia MUST acompañarse de la regeneración del
`package-lock.json` mediante `npm install`, sin cambios de versión mayor en
`next`, `react` ni `eve`.

#### Scenario: Dependencias muertas eliminadas

- GIVEN `@chat-adapter/state-redis` (sustituida por `@chat-adapter/state-memory` en la decisión de Stage 5) y `ai-sdk-provider-opencode-sdk` (cero imports)
- WHEN se completa la limpieza de la métrica
- THEN ambas MUST NOT aparecer en `package.json`
- AND MUST NOT existir ningún import de ellas en el repositorio

#### Scenario: Archivos sin uso eliminados

- GIVEN `app/api/admin/_lib/validate.ts`, `src/lib/admin/metrics/index.ts` y `src/lib/booking/index.ts`
- WHEN el `grep` de verificación confirma cero uso en todo el repositorio
- THEN los tres archivos MUST eliminarse
- AND `npx tsc --noEmit` y `npm run build` MUST seguir pasando

#### Scenario: Sin cambios en dependencias de runtime

- GIVEN el cambio aplicado
- WHEN se inspeccionan las versiones en `package.json`
- THEN `next`, `react` y `eve` MUST conservar su versión mayor previa
- AND el `package-lock.json` MUST haber cambiado solo por el efecto de `npm install`

### Requirement: Métrica sostenida por script y verificación continua

El `package.json` SHOULD exponer un script `knip` que ejecute la métrica, y el
pipeline de CI SHOULD incluir un paso que reporte la métrica. Ese paso SHOULD ser
**no bloqueante sobre `warnings`**: MUST NOT fallar el pipeline solo por
warnings, para no convertir la limpieza en un portón frágil. El conteo de issues
MUST quedar visible en la salida del paso.

#### Scenario: Script `knip` disponible

- GIVEN el `package.json` del cambio aplicado
- WHEN se inspecciona la sección `scripts`
- THEN SHOULD existir una entrada `knip` que ejecute la métrica de código muerto

#### Scenario: Paso de CI no bloqueante sobre warnings

- GIVEN una corrida de CI donde Knip reporta únicamente `warnings`
- WHEN el pipeline evalúa el paso de Knip
- THEN el pipeline SHOULD completarse sin fallar por esos warnings
- AND el reporte de la métrica MUST quedar visible en el log del paso

### Requirement: Falsos positivos del tipo `chat` resueltos en dos capas

El import de tipo `chat` en `agent/channels/whatsapp.ts:3` MUST quedar cubierto
por el shim ambiental existente `agent/eve-shim.d.ts:53` para el chequeo de
TypeScript, sin agregar el paquete `chat` como dependencia. Además, el issue
`unlisted` que Knip reporta para ese especificador (el shim aporta tipos, pero
Knip resuelve contra el manifiesto y no consulta declaraciones ambientales) MUST
resolverse declarando `"ignoreDependencies": ["chat"]` en `knip.json`, con la
justificación documentada de que `chat` es un tipo cubierto por el shim y no una
dependencia del manifiesto. El paquete `chat` MUST NOT agregarse a
`package.json` en ningún caso.

#### Scenario: Tipo `chat` cubierto sin dependencia fantasma

- GIVEN `agent/channels/whatsapp.ts` importando `Message` y `Thread` desde `chat`
- WHEN se ejecutan `npx knip` y `npx tsc --noEmit`
- THEN `npx tsc --noEmit` MUST seguir en verde con el shim `agent/eve-shim.d.ts:53`
- AND `npx knip` MUST NOT reportar el import de tipo `chat` como issue, gracias a `"ignoreDependencies": ["chat"]` en `knip.json`
- AND el paquete `chat` MUST NOT agregarse a `package.json`

#### Scenario: Shims de los adaptadores de chat documentados

- GIVEN los shims ambientales de `@chat-adapter/whatsapp` y `@chat-adapter/state-memory` en `agent/eve-shim.d.ts`
- WHEN se audita la justificación de falsos positivos del cambio
- THEN esos shims MUST quedar documentados como la cobertura vigente
- AND MUST NOT agregarse los paquetes que shimmean
