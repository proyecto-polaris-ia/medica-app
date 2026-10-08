# Propuesta: Pre-población del formulario de edición de consulta clínica

Issue: [#181](https://github.com/proyecto-polaris-ia/medica-app/issues/181)

## Por qué

El modal "Editar consulta" aparece **vacío**: al pulsar "Editar" sobre una nota SOAP
existente, los campos Subjetivo, Objetivo, Valoración, Plan, Tratamiento y Notas se
muestran en blanco en lugar de con los valores guardados.

Evidencia en código:

- `src/components/admin/patient-record/ClinicalVisitForm.tsx:46` inicializa el estado
  **solo al montar**: `const [formData, setFormData] = useState(visitToInput(visit));`.
  No existe ningún efecto que resincronice `formData` cuando cambia la prop `visit`.
- `src/components/admin/patient-record/PatientVisitsTab.tsx:166-172` monta
  `<ClinicalVisitForm>` **de forma persistente** (siempre presente en el árbol), y el
  modal se abre/cierra con `isOpen`/`visit` (`handleEdit` en `:40-43`, `handleNew` en
  `:45-48`, `handleClose` en `:50-53`).

Como el componente nunca se desmonta, React **reutiliza la instancia**. Cuando el
usuario elige una consulta, `visit` pasa de `null` a la consulta seleccionada, pero
`useState` ya se ejecutó con `visitToInput(null)` (forma vacía) y no vuelve a
ejecutarse. El formulario queda con los valores iniciales vacíos. La corrección es
resincronizar `formData` cuando cambia `visit`.

## Alcance

### Incluido

- Resincronizar `formData` con `visitToInput(visit)` cuando cambia la prop `visit`, de
  modo que editar pre-poble todos los campos SOAP y crear abra el formulario vacío.
- Pruebas de componente que reproducen el ciclo montar → cambiar `visit` → re-render,
  incluyendo el paso de una consulta a otra y el paso a "Nueva consulta" sin datos
  obsoletos.

### Fuera de alcance (qué no cambia)

- **Contrato de guardado**: `handleSubmit`, el payload `ClinicalVisitInput` y las rutas
  `POST`/`PATCH` no cambian.
- **`PatientVisitsTab.tsx`**: el patrón de montaje persistente y `handleClose`/
  `handleEdit`/`handleNew` se conservan tal cual; el fix vive solo en el formulario.
- **Flujo de archivos adjuntos**: `savedVisit`, `PatientFilesTab` y la carga posterior
  al guardado no se modifican.
- **Backend, Supabase, migraciones y RLS**: sin cambios.
- **`travelhub-app`**: no se modifica ningún archivo de ese proyecto.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `clinical-record`: se agrega el comportamiento observable de pre-población y limpieza
  del formulario de edición/creación de notas SOAP. El resto de los requisitos vigentes
  de `openspec/specs/clinical-record/spec.md` (acceso autenticado, historia clínica
  aparato 1:1, badge de advertencia, CRUD SOAP y listado de consultas) permanecen sin
  cambios.

| Capacidad | Tipo | Spec del cambio |
|---|---|---|
| `clinical-record` | Modificada | `openspec/changes/fix-clinical-visit-edit-form/specs/clinical-record/spec.md` |

## Enfoque

Se agrega un único `useEffect(() => { setFormData(visitToInput(visit)); }, [visit])` en
`ClinicalVisitForm.tsx`. Como `handleClose` del padre **siempre** vuelve a poner
`editingVisit` en `null`, depender solo de `[visit]` cubre todos los ciclos
abrir/cerrar/editar: al cerrar, `visit` regresa a `null` y `visitToInput(null)` deja el
formulario vacío; al abrir otra consulta, `visit` cambia y el formulario se repuebla.
No se usa remonte por `key` ni un formulario no controlado (ver justificación en
`design.md`).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `src/components/admin/patient-record/ClinicalVisitForm.tsx` | Modificado | Efecto de resincronización de `formData` con la prop `visit`. |
| `src/components/admin/patient-record/ClinicalVisitForm.test.tsx` | Modificado | Casos de re-render con `visit` cambiante (edición, nueva consulta, cambio entre consultas). |
| `src/components/admin/patient-record/PatientVisitsTab.tsx` | Conservado | Sin cambios: el padre ya pone `visit` en `null` al cerrar. |
| `app/api/admin/patients/**` | Conservado | El contrato HTTP de consultas clínicas no se toca. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El resync por `[visit]` descarte ediciones en curso si el padre re-crea el objeto `visit` mientras el modal está abierto | Baja | El padre solo cambia `editingVisit` en `handleEdit`/`handleNew`/`handleClose`; `onVisitsChanged` ocurre tras guardar y cierra el modal. Se documenta como supuesto en `design.md`. |
| Regresión en el flujo de creación (campos con datos residuales de una edición previa) | Media | Se cubre con pruebas de TRIANGULATE: escribir con una consulta cargada y pasar `visit={null}` debe dejar los campos vacíos. |

## Plan de rollback

Reversión de **un solo componente**: revertir el cambio en
`src/components/admin/patient-record/ClinicalVisitForm.tsx` (y sus pruebas) restaura el
comportamiento anterior sin efectos colaterales.

- **Sin migraciones ni cambios de datos**: no hay nada que revertir en Supabase.
- **Sin cambios de contrato**: el payload de guardado y las rutas no cambian, por lo que
  revertir no deja residuos ni rompe consumidores.
- `PatientVisitsTab.tsx` no se modifica, así que el rollback no requiere tocarlo.

## Criterios de éxito

- [ ] Al pulsar "Editar" sobre una consulta, todos los campos (Subjetivo, Objetivo,
      Valoración, Plan, Tratamiento, Notas) muestran los valores guardados.
- [ ] Al pulsar "Nueva consulta" después de editar, el formulario se muestra vacío.
- [ ] Cambiar de una consulta a otra en modo edición actualiza los campos a la nueva.
- [ ] `npx vitest run src/components/admin/patient-record/ClinicalVisitForm.test.tsx`,
      `npx tsc --noEmit` y `npm run lint` quedan limpios.
