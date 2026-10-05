# Tasks: Métrica confiable de código muerto (deadcode)

Fuentes: `proposal.md`, `specs/code-quality/spec.md` (6 requisitos / 20
escenarios) y `design.md` (D1–D7). El orden es obligatorio:
**config → dependencias → archivos → exports/tipos → script + CI → cierre**.
Cada tarea es **una unidad revisable** con su propia verificación y su propia
sugerencia de commit convencional. Marca la casilla sólo después de observar la
verificación en verde.

**TDD (design D7):** este cambio es preservación de comportamiento; no existe
test unitario que exprese "el código muerto fue eliminado". Se documenta la
excepción de aplicabilidad RED/GREEN y se sustituye por verificación
determinista por comando. Equivalente: RED = `npx knip` con el lote pendiente
(issues > 0); GREEN = 0 issues con typecheck, lint, test y build en verde.

**Escala de forecast:** S ≤ 30 min (pocos símbolos, un comando de cierre) ·
M ≈ 1 sesión focalizada · L > 1 sesión (debe partirse en apply).

| Sección | Tareas | Forecast |
|---|---|---|
| 1. Configuración `knip.json` | 1 | S |
| 2. Retiro de dependencias | 1 | S |
| 3. Eliminación de archivos | 3 | S c/u |
| 4. Exports y tipos (lotes) | 9 | M ×5, S ×4 |
| 5. Script + CI | 1 | S |
| 6. Verificación de cierre | 5 | M ×2, S ×3 |

**Total: 20 tareas · ≈ 27 puntos** (S=1, M=2, L=4), dominado por la sección 4
(14 puntos). Ninguna tarea debe quedar en L: si un grupo supera una sesión, se
parte por archivo en apply.

**Decision needed before apply: No.** Las dos correcciones de spec
(`binaries` → `ignoreBinaries` en D1 y la cobertura de `chat` en dos capas en
D2) ya están reflejadas en `specs/code-quality/spec.md`. Las decisiones
remanentes son de apply y quedan delegadas con regla explícita en cada tarea:
(a) barril que quede vacío → se borra el archivo (regla fijada en 4.1/4.2);
(b) commit por grupo vs. consolidado → preferir unidades revisables (nota de la
sección 4); (c) `test:local` vs. suite dirigida → regla determinista en 6.4.

---

## 1. Configuración de `knip.json` (design D1)

Primero se apagan los falsos positivos para que el reporte restante sea señal
real. `knip.json` es JSON estricto: la justificación de cada clave vive en
`design.md` D1 (documentación referenciada), no como comentario inline.

- [ ] 1.1 Reescribir `knip.json` a la forma final de D1: `entry` sin
  `middleware.ts` (`app/**/page|layout|route.{ts,tsx}` + `scripts/**`),
  `project` sin cambios (`app/**`, `src/**`, `scripts/**`, `tests/**`),
  `ignoreBinaries: ["supabase"]`, `ignoreDependencies: ["eslint-config-next", "chat"]`,
  `ignoreExportsUsedInFile: true`, `$schema` conservado.
  **Regla de apply (D2):** confirmar que `npx knip` *consume* el ignore de `chat`
  (sin "Unused item in ignoreDependencies: chat"); si Knip lo reporta como ignore
  no usado, quitar `"chat"` y dejar constancia en `verify-report.md`.
  Verificación: `npx knip` (los issues bajan y sólo quedan hallazgos reales; sin
  error de clave desconocida).
  Commit: `chore(knip): tighten config to remove false positives`

---

## 2. Retiro de dependencias muertas (design D3)

- [ ] 2.1 Borrar de `package.json` las líneas de `@chat-adapter/state-redis`
  y `ai-sdk-provider-opencode-sdk` (sin tocar `@chat-adapter/state-memory` ni
  `@ai-sdk/openai-compatible`) y correr `npm install` para regenerar
  `package-lock.json`. **Prohibido:** `npm audit fix`, `npm audit fix --force`,
  `npm update` o instalación manual por paquete. Confirmar que `next`, `react` y
  `eve` conservan su versión mayor y que `git diff package-lock.json` se limita
  al efecto de esas dos dependencias.
  Verificación: `npx knip` y `npx tsc --noEmit`.
  Commit: `chore(deps): remove unused @chat-adapter/state-redis and ai-sdk-provider-opencode-sdk`

---

## 3. Eliminación de archivos sin uso (design D4)

Cada archivo se re-verifica con `grep` **antes** de borrarlo. Si el grep muestra
uso ≠ 0, **no se borra**: se registra como contrato compartido y se documenta la
excepción.

- [ ] 3.1 `app/api/admin/_lib/validate.ts`: `grep -rn "_lib/validate" app src agent scripts tests`
  (sólo deben aparecer importadores de `app/api/booking/_lib/validate.ts`) → borrar.
- [ ] 3.2 `src/lib/admin/metrics/index.ts`: `grep -rn "@/lib/admin/metrics\"\|'@/lib/admin/metrics'" app src agent scripts tests`
  (0 coincidencias; los consumidores importan submódulos) → borrar.
- [ ] 3.3 `src/lib/booking/index.ts`: `grep -rn "@/lib/booking\"\|'@/lib/booking'" app src agent scripts tests`
  (0 coincidencias) → borrar.

Verificación (al cerrar la sección): `npx tsc --noEmit`, `npm run lint` y
`npm run build`.
Commit: `chore(cleanup): remove unused validate and barrel files`

---

## 4. Exports y tipos sin uso (design D5)

**Procedimiento por símbolo** (requisito "Eliminación basada en evidencia de
cero uso"), repetido en cada sub-lote:

1. `grep -rn -w "<Symbol>" app src agent scripts tests middleware.ts` (+ grep del
   path del archivo declarante para detectar barriles `export * from './x'`).
2. Decisión:
   - referencias sólo dentro del archivo declarante → **quitar `export`**;
   - cero referencias en todo el repo → **eliminar la declaración**;
   - referencias fuera del archivo declarante → **conservar** y registrar el uso
     (p. ej. `src/lib/whatsapp/inbound-decision.ts`).
3. **Barril que quede vacío** (distinto de los 3 archivos de la sección 3) → se
   **borra el archivo** (decisión de apply ya resuelta en favor del borrado).

**Verificación:** por sub-lote `npx tsc --noEmit`; al cerrar **cada grupo**
`npm run lint`, `npm run test`, `npm run build` y `npx knip` (el conteo MUST NOT
aumentar respecto del grupo anterior).

**Commits:** un commit por grupo (mensajes abajo). Si un grupo queda pequeño, el
agente de apply MAY consolidar grupos con el mensaje
`chore(cleanup): remove unused exports across lib, app and tests`, prefiriendo
siempre unidades revisables; si consolida, corre igualmente los cuatro comandos
en cada frontera de consolidación y lo documenta en `verify-report.md`.

- [ ] 4.1 Grupo (a) `src/lib/admin/**` sin `metrics/` (cubre el lote 3 del design).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in src/lib/admin`
- [ ] 4.2 Grupo (b) `src/lib/booking/**` + `src/lib/citas/**` + `src/lib/follow-up/**`
  (lotes 5–6 y parte del 7 del design). Nota: los barriles `booking/index.ts` y
  `admin/metrics/index.ts` ya se borraron en 3.2/3.3.
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in booking, citas and follow-up`
- [ ] 4.3 Grupo (c) `src/lib/observability/**` + `src/lib/payments/**` (parte del lote 7/9 del design).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in observability and payments`
- [ ] 4.4 Grupo (d) `src/lib/wcc-*.ts` (lote 8 del design).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in wcc modules`
- [ ] 4.5 Grupo (e) `src/lib/whatsapp/**` + `src/lib/web-chat/**` + `src/lib/ai/**` + `src/lib/flows/**` + `src/lib/supabase/**` (lote 9 del design).
  Conservar explícitamente los contratos que el grep muestre en uso
  (`whatsapp/inbound-decision.ts` en particular).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in whatsapp and related lib modules`
- [ ] 4.6 Grupo (f) `src/components/**` + `src/test-utils/**` (harness de UI; remanente del lote 12 del design).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in components and test-utils`
- [ ] 4.7 Grupo (g) `app/**` restante: rutas admin, `app/(admin)/**` y páginas (lotes 1–2 y remanente del 12 del design).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports under app`
- [ ] 4.8 Grupo (h) `tests/**` incluyendo `tests/e2e/helpers/{booking,db}.ts` (lote 11 del design). Los exports marcados se tratan igual: el grep incluye `tests/` y los `*.spec.ts` (entries por los plugins vitest/playwright).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in test helpers`
- [ ] 4.9 Grupo (i) `agent/**` + `scripts/**` + remanente de raíz (`middleware.ts`) (lotes 10 y 12 del design; requerido para llegar a 0 issues).
  Verificación de cierre de grupo: `npm run lint && npm run test && npm run build` + `npx knip`.
  Commit: `chore(cleanup): remove unused exports in agent and scripts`

---

## 5. Métrica sostenida: script + CI (design D6)

- [ ] 5.1 Agregar `"knip": "knip"` a `scripts` de `package.json` (entre
  `typecheck` y `sanity`) y agregar al job `test` de `.github/workflows/ci.yml`,
  después de `Typecheck`, el paso de D6 con **paso normal, sin
  `continue-on-error`**: Knip 6 sale con código 1 sólo ante issues reales
  (`maxIssues=0`); los configuration/tag hints son warnings y no cambian el exit
  code (así el paso nunca falla sólo por warnings, como pide el requisito).

  ```yaml
      - name: Dead code (knip)
        # Métrica de código muerto. Knip 6 sale con código 1 sólo cuando hay
        # issues (maxIssues=0); los configuration/tag hints (warnings) no
        # cambian el exit code salvo treatConfigHintsAsErrors/treatTagHintsAsErrors,
        # que no se fijan. Así el paso falla por regresiones reales y nunca
        # sólo por warnings.
        run: npm run knip
  ```

  Verificación: `npm run knip` (equivalente exacto de `npx knip`).
  Commit: `ci(knip): gate dead-code metric with npm run knip`

---

## 6. Verificación de cierre (design D7 y §Plan de verificación)

- [ ] 6.1 `npx knip` → 0 issues (exit 0). Cualquier issue remanente sin
  justificación documentada es defecto.
- [ ] 6.2 `npx tsc --noEmit` y `npm run lint` → exit 0.
- [ ] 6.3 `npm run build` → build de Next exitoso.
- [ ] 6.4 Pruebas según la regla determinista del design §Verificación: si la
  limpieza tocó **algún** export/tipo de módulos de datos de `architecture.md`
  §9 (`src/lib/{admin,booking,citas,wcc-*,whatsapp,payments,follow-up,observability}`),
  correr `npm run test:local` (prerequisito local: `supabase start` +
  `supabase db reset`). Sólo si el grep y la lista de archivos tocados muestran
  que **ningún** símbolo de esos módulos cambió, se sustituye por una suite
  dirigida de vitest sobre las áreas tocadas y se documenta la sustitución con
  la evidencia del grep en `verify-report.md` (design, decisión abierta 4; esta
  regla subsume recordatorios/citas/pagos y los módulos de datos de §9).
- [ ] 6.5 Guardas de dependencias: `npm audit` → `found 0 vulnerabilities` y
  confirmar que `next`, `react`/`react-dom` y `eve` conservan su versión mayor
  previa (constraint de `openspec/specs/dependency-management/spec.md`).

Verificación de cierre (una por una):
- `npx knip`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run test:local` **o** la suite dirigida sustituta documentada (regla 6.4)
- `npm audit`

Sin commit propio (no hay cambio de código; la evidencia va en
`verify-report.md`). El cambio queda listo para `sdd-verify` y archive.

---

## Fuera de alcance (recordatorio)

- No tocar `travelhub-app`.
- No refactors funcionales ni cambios de comportamiento en runtime.
- No agregar el paquete `chat` a `package.json`.
- No eliminar exports que el grep muestre en uso.
- No cambiar `next`, `react`, `eve` ni dependencias de runtime fuera de las dos
  muertas de la sección 2.
