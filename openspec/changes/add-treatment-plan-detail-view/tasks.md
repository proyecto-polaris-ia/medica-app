# Tasks: Vista de detalle para planes de tratamiento (issue #178)

## Forecast de carga

| Archivo | Acción | Estimado (líneas) | Riesgo |
|---------|--------|-------------------|--------|
| `src/components/admin/patient-record/TreatmentPlanDetailModal.tsx` | Nuevo | ~230 | Med — fetch + desglose + cierres + a11y en un componente |
| `src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx` | Nuevo | ~260 | Med — mock de `fetch` por estado (carga/éxito/error) y cierres |
| `src/components/admin/patient-record/TreatmentPlansTab.tsx` | Modificado | ~+45 / −5 | Bajo — estado `detailPlanId` y card clicable sin tocar Editar/Eliminar |
| `src/components/admin/patient-record/TreatmentPlansTab.test.tsx` | Modificado | ~+80 | Bajo — `buildFetchMock` ya resuelve el `GET` del plan |
| **Total** | 2 nuevos + 2 modificados | **~615** | **Med** |

| Field | Value |
|-------|-------|
| Estimated changed lines | ~615 (componente ~230, suite nueva ~260, cableado ~45, casos de pestaña ~80) |
| 400-line budget risk | Med |
| Chained PRs recommended | No — un solo work unit coherente (detalle + su acceso). Si el diff supera 400 líneas de review, dividir en PR 1 (`TreatmentPlanDetailModal.tsx` + su test) y PR 2 (cableado de `TreatmentPlansTab.tsx` + casos de pestaña). |
| Delivery strategy | single PR (con split opcional según lo anterior) |
| Riesgo de datos | Ninguno — sin migraciones, sin cambios de API, sin escrituras |

Decision needed before apply: No

Dependencias: ninguna. El `GET /api/admin/patients/[id]/treatment-plans/[planId]`
ya existe y devuelve `{ treatmentPlan: TreatmentPlanWithItems }`.

---

## Phase 1: Tests RED

### 1.1 Suite nueva del modal

- [x] 1.1.1 Crear `src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx` con el patrón `buildFetchMock` de `TreatmentPlansTab.test.tsx` (mock de `fetch` por URL + método; reutilizar `PROVIDER`, `BASE_PLAN`, `PLAN_WITH_ITEMS`, `formatCurrency` esperado en es-MX) cubriendo:
  - [x] estado de carga mientras la promesa del `GET` está pendiente;
  - [x] contenido del plan: nombre, estado en español (ej. `accepted` → "Aceptado"), dentista responsable (nombre resuelto por props provistas por la pestaña), fecha de creación, `acceptedAt` cuando existe, notas cuando existen;
  - [x] `acceptedAt` y notas ausentes (`null`) no se renderizan;
  - [x] tabla de ítems: descripción, diente FDI, cantidad, costo unitario, costo de línea (`cantidad × unitario`) y estado del ítem ("Pendiente"/"Realizado");
  - [x] desglose: Subtotal = `Σ` de líneas y Total = `plan.totalAmount` guardado (caso donde difieren: snapshot 1500 con ítems que suman 1400 → muestra ambos valores distintos);
  - [x] el modal NO muestra etiquetas de "Descuento" ni "Impuesto";
  - [x] plan `draft`: se muestra "Editar" y al activarlo se llama `onEdit` con el `id` del plan;
  - [x] plan no-`draft` (`accepted`): no hay "Editar", "Eliminar" ni controles de cambio de estado;
  - [x] cierre con botón ✕; cierre con clic en el overlay; NO cierra con clic dentro del panel; cierre con `Escape`;
  - [x] error del fetch: mensaje de error + botón de reintento (vuelve a llamar `fetch`) + botón de cierre;
  - [x] a11y: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` presente y botón ✕ con `aria-label="Cerrar"`.
- [x] 1.1.2 Ejecutar `npm run test -- --run src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx` y capturar el fallo rojo esperado (módulo inexistente / componente no exportado).

### 1.2 Casos nuevos en la suite de la pestaña

- [x] 1.2.1 Extender `src/components/admin/patient-record/TreatmentPlansTab.test.tsx` con:
  - [x] clic en la card del plan abre el detalle y muestra los ítems (`getTreatmentPlan` del `buildFetchMock`); el plan correcto cuando hay dos planes;
  - [x] botón "Ver detalle" abre el detalle y es accesible por teclado (`tab` + `Enter`);
  - [x] "Editar" dentro del detalle de un plan `draft` abre `TreatmentPlanForm` y cierra el detalle;
  - [x] plan no-`draft`: existe "Ver detalle", no existe "Editar" ni "Eliminar" en la card, y el detalle no ofrece acciones de escritura.
- [x] 1.2.2 Ejecutar `npm run test -- --run src/components/admin/patient-record/TreatmentPlansTab.test.tsx` y capturar el fallo rojo esperado (el detalle no existe todavía).
- [x] 1.2.3 Verificar que los casos RED corresponden a escenarios del delta spec `specs/treatment-plans/spec.md` (al menos: apertura desde card, apertura desde botón, contenido de ítems, subtotal/total, draft con Editar, no-draft solo lectura, cierres, carga, error, móvil).

---

## Phase 2: Implementación (GREEN)

### 2.1 `TreatmentPlanDetailModal.tsx`

- [x] 2.1.1 Crear `src/components/admin/patient-record/TreatmentPlanDetailModal.tsx` con props `{ patientId: string; planId: string; providerName: string; onClose: () => void; onEdit?: (planId: string) => void }`:
  - [x] fetch al montar/abrir siguiendo el patrón de `TreatmentPlanEditFormWrapper` (`TreatmentPlansTab.tsx:222–291`): `GET /api/admin/patients/${patientId}/treatment-plans/${planId}` → `data.treatmentPlan`; estados `plan | null`, `loading`, `error`; limpiar `plan` al desmontar/cerrar.
  - [x] estado de carga con texto visible; estado de error con mensaje, botón de reintento (repite el fetch) y botón de cierre.
  - [x] layout: overlay `fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4`; panel `w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-lg`; en móvil el panel ocupa el ancho y la tabla de ítems no recorta datos (`overflow-x-auto`, o lista etiqueta/valor por ítem por debajo de `sm`).
  - [x] encabezado con el nombre del plan, badge de estado en español, y botón ✕ con `aria-label="Cerrar"`; `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `autoFocus` en ✕.
  - [x] metadata: dentista responsable, fecha de creación (`formatDate` es-MX), fecha de aceptación solo si `acceptedAt`, notas solo si existen.
  - [x] tabla de ítems: descripción, diente FDI (`—` si `null`), cantidad, costo unitario, costo de línea (`quantity × unitPrice` con aritmética en centavos) y estado del ítem ("Pendiente"/"Realizado").
  - [x] desglose: Subtotal = `Σ` de ítems (aritmética en centavos, `moneyToCents` + `reduce`, sin drift) y Total = `plan.totalAmount` (snapshot); sin descuento ni impuesto.
  - [x] acciones: solo si `plan.status === 'draft'` renderizar botón "Editar" que llama `onEdit?.(plan.id)`; en cualquier otro estado, ninguna acción de escritura.
  - [x] cierres: `useEffect` con listener `keydown` en `document` para `Escape` (cleanup al desmontar); `onClick` en overlay solo cuando `event.target === event.currentTarget`; ✕ llama `onClose`.
- [x] 2.1.2 Ejecutar `npm run test -- --run src/components/admin/patient-record/TreatmentPlanDetailModal.test.tsx` — verde.
- [x] 2.1.3 REFACTOR: extraer subcomponentes locales si el archivo lo pide (fila de ítem, desglose), sin cambiar el contrato observable; repetir el test focalizado.

### 2.2 Cableado en `TreatmentPlansTab.tsx`

- [x] 2.2.1 Modificar `src/components/admin/patient-record/TreatmentPlansTab.tsx`:
  - [x] estado `detailPlanId: string | null` (junto a `editingPlan`/`isFormOpen`); helper `handleOpenDetail(plan)` con `stopPropagation` cuando venga de un botón interno.
  - [x] card (`<article>`) clicable: `cursor-pointer`, `role="button"`, `tabIndex={0}`, `onClick` y `onKeyDown` (`Enter`/`Space`) para abrir el detalle, con `aria-label` descriptivo del plan.
  - [x] botón "Ver detalle" nativo en cada card (`stopPropagation`) junto a Editar/Eliminar existentes; Editar/Eliminar siguen exclusivos de `draft`.
  - [x] render de `<TreatmentPlanDetailModal>` cuando `detailPlanId !== null`, pasando `providerName` resuelto con `providerById`, `onClose` (limpia `detailPlanId`) y `onEdit` (limpia `detailPlanId`, setea `editingPlan` y abre `isFormOpen` para reutilizar `TreatmentPlanEditFormWrapper`).
  - [x] no cambiar el comportamiento actual de crear/editar/eliminar ni el estado vacío/carga/error.
- [x] 2.2.2 Ejecutar `npm run test -- --run src/components/admin/patient-record/TreatmentPlansTab.test.tsx` — verde.
- [x] 2.2.3 Ejecutar `npm run test -- --run src/components/admin/patient-record/TreatmentPlanForm.test.tsx` para confirmar que el flujo de edición reutilizado no se rompió — verde.

---

## Phase 3: Verificación

- [ ] 3.1 Ejecutar `npm run test` — suites completas en verde (reportar cualquier fallo preexistente ajeno al cambio, por nombre).
- [ ] 3.2 Ejecutar `npx tsc --noEmit` — sin errores de tipos.
- [ ] 3.3 Ejecutar `npm run build` — build de producción exitoso.
- [ ] 3.4 Cross-check de escenarios: recorrer `specs/treatment-plans/spec.md` y confirmar que cada escenario nuevo tiene al menos un caso de prueba que lo cubre; anotar el mapeo.
- [ ] 3.5 Confirmar presupuesto de review: si el diff supera ~400 líneas, proceder con el split opcional (PR 1 modal + tests, PR 2 cableado + tests).
- [ ] 3.6 Escribir `openspec/changes/add-treatment-plan-detail-view/verify-report.md` con comandos exactos y resultados observados.

---

## Phase 4: Archive + PR

- [ ] 4.1 Mover el delta a la spec principal: actualizar el requerimiento "Treatment plan tab in patient record" en `openspec/specs/treatment-plans/spec.md` con el texto y los escenarios del delta, y archivar la carpeta como `openspec/changes/archive/YYYY-MM-DD-add-treatment-plan-detail-view/` (fecha ISO del archive; preservar como audit trail).
- [ ] 4.2 Actualizar `odd/tasks/add-treatment-plan-detail-view.md` (marcar tareas del ciclo SDD completadas) solo si el orchestrador lo autoriza.
- [ ] 4.3 Commit(s) por work unit: (a) modal + su suite, (b) cableado de la pestaña + casos de pestaña, (c) artefactos OpenSpec. Nunca mezclar tests de otra unidad con código no relacionado.
- [ ] 4.4 Push de la rama `eliumontoya/agregar-vista-de-detalle-para-planes-de-tratamie` y abrir PR referenciando el issue #178 (`Closes #178`), con plan de rollback (`git revert`) y evidencia de verificación.
