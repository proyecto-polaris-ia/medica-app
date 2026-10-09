# Design: ux-truncar-notas-evolucion

Issue [#182](https://github.com/proyecto-polaris-ia/medica-app/issues/182).

## 1. Contexto

`PatientVisitsTab.tsx` renderiza la lista de notas SOAP como cards con un
`<dl>` de cinco campos de texto. Todos se renderizan completos, sin límite.
El issue propone un componente reutilizable `ExpandableText` con truncamiento
a 150 caracteres y expansión bajo demanda.

## 2. Estructura

```
src/components/admin/
├── ExpandableText.tsx              <- nuevo, componente de presentación puro
├── __tests__/
│   └── ExpandableText.test.tsx     <- nuevo, Vitest + Testing Library
└── patient-record/
    └── PatientVisitsTab.tsx        <- edición: <dd> → <ExpandableText>
```

`ExpandableText` vive junto a los demás componentes reutilizables del panel
(`DataTable`, `Pagination`, `EmptyState`), no dentro de `patient-record/`,
porque su contrato (`text` + `maxLength` + `fallback`) es genérico.

## 3. Decisiones

### D1 — Componente separado, no inline
El issue lo permite en ambas formas. Se separa en archivo propio porque el
panel ya tiene la convención de un componente reutilizable por archivo con su
prueba colocalizada en `__tests__/` (ver `DataTable`, `Pagination`).

### D2 — Umbral solo por caracteres; "3 líneas" queda como aproximación
La regla del issue es "150 caracteres **o** 3 líneas, lo que sea menor".
Medir líneas reales exige refs, medición de layout post-render y manejo de
resize (o `ResizeObserver`), con riesgo de parpadeo e hidratación inconsistente
en un `<dd>` de ancho variable y responsive. A ~60–70 caracteres por línea en
el ancho típico de la card, 150 caracteres equivalen a 2–3 líneas, lo que
cumple la intención del umbral con un corte determinista y testeable. Los
criterios de aceptación del issue solo exigen los 150 caracteres. El corte es
exacto: `text.slice(0, maxLength) + '...'`, sin ajuste por palabra.

### D3 — Umbral responsive móvil descartado
El issue sugiere (como consideración opcional, no criterio de aceptación)
reducir el umbral en móvil a ~100 caracteres. Requiere leer el viewport en
runtime (SSR/hidratación) o media queries en JS. Se descarta en este change:
no es criterio de aceptación y el costo de complejidad no se justifica.

### D4 — Accesibilidad con botón nativo
Botón `<button type="button">`: navegación por Tab y activación con
Enter/Space son nativas. Se añade `aria-expanded={isExpanded}` para que screen
readers anuncien el estado. El texto visible del botón ("Ver más"/"Ver menos")
sirve de nombre accesible.

### D5 — Estado por instancia
Cada `ExpandableText` mantiene su propio `useState(false)` inicial. Esto da
gratis el estado independiente por campo y por nota, sin estado elevado ni
persistencia (el issue marca la persistencia como probablemente innecesaria;
se descarta).

### D6 — Props exactas
```ts
type ExpandableTextProps = {
  text: string | null;
  maxLength?: number; // default 150
  fallback?: string;  // default '—'
};
```
`text` acepta `null` para mapear directo a los campos opcionales de
`ClinicalVisit`. El fallback `'—'` replica el render actual `?? '—'`.

### D7 — Aplicación en PatientVisitsTab
Los cinco `<dd>` pasan a envolver `<ExpandableText text={visit.<campo>} />`
(con `className` del `<dd>` intacto). El `<h4>` del "Subjetivo" no cambia.
Sin `maxLength` explícito: el default `150` es el contrato specificado.

## 4. Estrategia de pruebas (TDD, `strict_tdd: true`)

Vitest + Testing Library + `user-event`, colocalizadas en
`src/components/admin/__tests__/ExpandableText.test.tsx`. Cada criterio del
delta spec tiene su prueba:

1. RED: texto corto → contenido completo, `queryByRole('button')` nulo.
2. RED: texto largo → truncado exacto + botón "Ver más" con
   `aria-expanded="false"`.
3. RED: click en "Ver más" → texto completo + "Ver menos" con
   `aria-expanded="true"`.
4. RED: click en "Ver menos" → truncado de nuevo.
5. RED: `null` → `'—'`, sin botón.
6. RED: independencia de estado entre dos instancias (simulando dos campos de
   la misma card).

La integración en `PatientVisitsTab` se cubre con un smoke test ligero:
renderizar la tab con una visita de texto largo muestra el truncado y el
botón (reutilizando el patrón de `PatientRecordView.test.tsx` si el mock lo
permite; si el costo de mocking es alto, la cobertura del componente puro más
`build`+`tsc` sobre la integración es proporcional al riesgo — decisión que
toma el aplicador y reporta en `verify-report.md`).

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Corte a mitad de palabra se ve tosco | Aceptado (D2); refinamiento posterior fuera de alcance |
| Texto con saltos de línea (`\n`) pierde formato | Ya ocurre hoy (`<dd>` sin `whitespace-pre-line`); sin regresión nueva |
| Botón hereda estilos globales | Clases Tailwind explícitas en el botón (`ml-2 text-sm font-medium text-blue-600 hover:text-blue-800`) |
