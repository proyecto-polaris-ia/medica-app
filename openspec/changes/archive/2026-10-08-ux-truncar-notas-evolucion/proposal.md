# Change: Truncar textos largos en notas de evolución con botón "Ver más"

## Why

En `PatientVisitsTab.tsx` (src/components/admin/patient-record/PatientVisitsTab.tsx),
los cinco campos de texto de cada nota SOAP (`objective`, `assessment`, `plan`,
`treatment`, `notes`) se renderizan completos sin límite:

```tsx
<dd className="text-sm text-gray-900">{visit.objective ?? '—'}</dd>
```

Una nota extensa (500+ caracteres) expande la card verticalmente sin tope,
rompe la densidad visual de la lista y hace difícil escanear el historial.
Con datos reales de la clínica esto degrada la usabilidad del expediente
(issue [#182](https://github.com/proyecto-polaris-ia/medica-app/issues/182),
etiqueta `status:approved`).

## What Changes

- **Componente reutilizable `ExpandableText`.** Nuevo componente en
  `src/components/admin/ExpandableText.tsx` con props `text: string | null`,
  `maxLength` (default `150`) y `fallback` (default `'—'`).
- **Truncamiento por caracteres.** Textos de más de `maxLength` caracteres se
  muestran truncados (`slice(0, maxLength)` + `'...'`) con un botón
  **"Ver más"**; al expandir se muestra el texto completo con botón
  **"Ver menos"**. La regla "3 líneas" del issue se documenta como aproximada
  (ver `design.md` §3, D2): el umbral determinista es el de caracteres.
- **Estado independiente por campo.** Cada instancia de `ExpandableText`
  mantiene su propio estado de expansión; expandir "Objetivo" no afecta a los
  demás campos ni a otras cards.
- **Aplicación acotada.** Se reemplaza el render directo en los cinco campos
  de texto largo de `PatientVisitsTab.tsx`. El campo "Subjetivo" (título de la
  card) NO se trunca.
- **Accesibilidad.** Botón nativo (`type="button"`), navegable con Tab y
  activable con Enter/Space, con `aria-expanded` para screen readers.

## Impact

- **Affected specs:** `clinical-record` (delta `ADDED`: comportamiento de
  truncamiento de la lista de notas SOAP).
- **Affected code:**
  - `src/components/admin/ExpandableText.tsx` (nuevo)
  - `src/components/admin/__tests__/ExpandableText.test.tsx` (nuevo)
  - `src/components/admin/patient-record/PatientVisitsTab.tsx` (edición)
- **Sin cambios de datos ni API:** es un cambio puramente de presentación;
  `ClinicalVisit` y los endpoints de `clinical-visits` quedan intactos.

## Success Criteria

Los criterios de aceptación del issue #182, verificados con pruebas unitarias
(Vitest + Testing Library) y checks técnicos (`tsc --noEmit`, `lint`, `test`,
`build`):

1. Campos con ≤ 150 caracteres (o `null`) se muestran completos sin botón.
2. Campos con > 150 caracteres se muestran truncados con botón "Ver más".
3. "Ver más" muestra el texto completo y cambia a "Ver menos".
4. "Ver menos" vuelve a truncar.
5. `aria-expanded` refleja el estado y el botón es operativo por teclado.
6. `null` renderiza el fallback `'—'` sin botón.
7. El campo "Subjetivo" permanece sin truncar.
8. El estado de expansión es independiente por campo.

## Rollback

Cambio de bajo riesgo, sin migraciones ni contratos. Rollback: revertir el
commit de la feature; `ExpandableText` es nuevo y `PatientVisitsTab.tsx`
recupera su render directo anterior.
