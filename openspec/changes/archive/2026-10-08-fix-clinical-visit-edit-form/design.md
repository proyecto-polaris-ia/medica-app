# Diseño: Pre-población del formulario de edición de consulta clínica

Change: `fix-clinical-visit-edit-form` (issue #181)
Capacidad: `clinical-record` (modificada)

## Causa raíz

`ClinicalVisitForm` es un componente controlado que inicializa su estado una sola vez:

```tsx
// src/components/admin/patient-record/ClinicalVisitForm.tsx:46
const [formData, setFormData] = useState(visitToInput(visit));
```

El inicializador de `useState` se evalúa **únicamente en el primer render** de la
instancia. El padre monta el formulario de forma persistente:

```tsx
// src/components/admin/patient-record/PatientVisitsTab.tsx:166-172
<ClinicalVisitForm
  patientId={patientId}
  visit={editingVisit}
  isOpen={isFormOpen}
  ...
/>
```

`editingVisit` empieza en `null` (`:37`) y solo cambia cuando el usuario pulsa "Editar"
(`handleEdit`, `:40-43`) o "Nueva consulta" (`handleNew`, `:45-48`). Debido a que el
componente no se desmonta entre aperturas, React **reutiliza la misma instancia** y
`useState` no se vuelve a ejecutar; por eso el modal de edición queda con la forma vacía
de `visitToInput(null)` aunque `visit` ya contenga la consulta seleccionada. Las pruebas
existentes nunca re-renderizaban con una prop `visit` distinta, así que el defecto pasó
inadvertido.

## Solución elegida

Sincronizar el estado del formulario con la prop mediante un efecto:

```tsx
// Sincroniza el formulario con la consulta seleccionada; el componente se
// monta una sola vez y React reutiliza la instancia al cambiar de modo.
useEffect(() => {
  setFormData(visitToInput(visit));
}, [visit]);
```

Por qué es suficiente con `[visit]`:

- `handleClose` del padre (`PatientVisitsTab.tsx:50-53`) **siempre** fija
  `editingVisit` a `null`, tanto al cancelar como al guardar (`handleSaved`, `:55-58`).
- Al cerrar, `visit` cambia a `null` → `visitToInput(null)` devuelve la forma vacía.
- Al abrir otra consulta, `visit` cambia a ese objeto → el formulario se repuebla.
- Al pulsar "Nueva consulta" después de editar, `handleNew` fija `visit` a `null` (ya
  podría serlo), y `handleClose` previo también lo dejó en `null`; el efecto con
  dependencia `[visit]` no re-ejecuta si la referencia no cambió, pero el estado ya está
  vacío porque el último cambio de `visit` fue a `null`. El caso borde "escribir y luego
  cerrar" se cubre porque escribir no cambia `visit`, pero cerrar sí lo pone en `null`.

### Decisión: por qué no otras alternativas

| Alternativa | Por qué se rechaza |
|---|---|
| **Remonte por `key`** (`key={visit?.id ?? 'new'}` en el padre) | Obliga a tocar `PatientVisitsTab.tsx`, remonta el componente entero (incluido el panel de archivos y su estado) en cada apertura, y acopla el padre al ciclo de vida interno del formulario. El fix debe vivir en el formulario y ser mínimo. |
| **Formulario no controlado** (`defaultValue` + `ref`/`FormData`) | Cambia el modelo de estado y el flujo de `handleChange`/`handleSubmit`; además el proyecto ya usa inputs controlados en todos los formularios. Mayor superficie de regresión para un bug de sincronización. |
| **Mover el estado al padre** | Duplica la fuente de verdad y amplía el cambio a `PatientVisitsTab.tsx`, que el alcance declara conservado. |
| **Resync en cada render** (sin `useEffect`, comparando props) | Antipatrón: `setState` durante el render o comparaciones manuales frágiles; el `useEffect` con dependencia `[visit]` es el patrón idiomático de React para sincronizar estado derivado con una prop cambiante. |

### Supuesto y borde

El efecto depende de la **identidad** del objeto `visit`. Si el padre recreara el objeto
`visit` con los mismos datos mientras el modal está abierto, el formulario se
resincronizaría y descartaría ediciones en curso. Hoy eso no ocurre: `editingVisit` solo
se modifica en `handleEdit`/`handleNew`/`handleClose`, y `onVisitsChanged` (que refetcha
la lista) se dispara tras guardar o eliminar, y guardar cierra el modal. El supuesto
queda documentado en `proposal.md` (riesgos).

## Estrategia de pruebas

`strict_tdd: true` en `openspec/config.yaml`. Orden RED → GREEN → TRIANGULATE en
`src/components/admin/patient-record/ClinicalVisitForm.test.tsx` (Vitest + Testing
Library), reutilizando el `render`/`rerender` de RTL y `@testing-library/jest-dom`.

1. **RED** — Re-render de `visit={null}` a `visit={savedVisit}` con todos los campos
   poblados: cada `textarea`/`input` (Subjetivo, Objetivo, Valoración, Plan, Tratamiento,
   Notas) debe mostrar el valor de la consulta. Falla antes del fix porque el estado se
   quedó vacío.
2. **GREEN** — Agregar el `useEffect` de resincronización y confirmar la suite en verde.
3. **TRIANGULATE** — Casos alternos que protegen el contrato:
   - Pasar de `visit={savedVisit}` a `visit={null}` deja los campos vacíos.
   - Escribir en un campo con una consulta cargada y luego pasar a `visit={null}` no deja
     datos obsoletos ("Nueva consulta" limpia).
   - Escribir y luego pasar a **otra** consulta reemplaza los valores por los de la nueva.

La suite usa `Response.json` mockeado para `fetch` y no toca Supabase; corre con
`npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `src/components/admin/patient-record/ClinicalVisitForm.tsx` | Modificar | Añadir `useEffect` que resincroniza `formData` con `visit`. |
| `src/components/admin/patient-record/ClinicalVisitForm.test.tsx` | Modificar | Casos de re-render: edición pre-poblada, limpieza a nueva consulta y cambio entre consultas. |
| `openspec/changes/fix-clinical-visit-edit-form/**` | Nuevo | Este change (propuesta, diseño, tareas y delta de spec). |

Sin archivos nuevos de producción, sin migraciones y sin cambios de dependencias.

## Verificación

- `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
