# Informe de verificación — `agregar-filtro-servicios-calendario` (issue #177)

**Fecha**: 2026-10-08
**Worktree**: `.worktrees/medica-app/agregar-filtro-de-servicios-selecci-n-m-ltiple-e`
**Rama**: `feat/agregar-filtro-servicios-calendario` (base `91e9575`)
**Alcance**: fase VERIFY (solo lectura; no se modificó ni se confirmó ningún archivo)

## Veredicto

**PASS CON ADVERTENCIAS.** No hay defectos críticos ni mayores ni incumplimientos
de la especificación. Las 28 escenarios de la delta tienen al menos una prueba en
verde; los comandos obligatorios pasan. Las advertencias son de documentación
interna del cambio (`design.md`) y de lint preexistente, ajenas al código tocado.

## Evidencia ejecutada

| # | Comando | Resultado | Código de salida |
|---|---------|-----------|------------------|
| 1 | `npm test` | 143 archivos en verde / 22 omitidos (165); **1362 pruebas en verde / 243 omitidas (1605)** | 0 |
| 2 | `npx tsc --noEmit` | sin salida | 0 |
| 3 | `npm run lint` | 0 errores, 26 advertencias (ninguna nueva en archivos tocados) | 0 |
| 4 | `npm run build` | `✓ Compiled successfully`; 26 advertencias preexistentes; 0 errores | 0 |
| 5 | Focal (page + ServiceFilter + ProviderLegend + MonthCalendar) | 4 archivos, **76 pruebas en verde** | 0 |
| 6 | `git status --porcelain` | 2 modificados (`page.tsx`, `page.test.tsx`), 3 sin seguimiento (delta OpenSpec, `ServiceFilter.tsx` y su prueba) | — |

Comprobación de advertencias nuevas de lint: `Link` (`page.tsx:4:8`) y
`clinicTimeLabel` (`page.tsx:20:3`) ya estaban sin usar en `git show HEAD:` (líneas
4 y 19). `ServiceFilter.tsx`, `ServiceFilter.test.tsx` y `page.test.tsx` no
producen advertencias. Conclusión: **no hay advertencias nuevas**.

## Trazabilidad de escenarios (28/28)

### Requisito MODIFICADO — filtro de proveedores (12)

| Escenario | Prueba |
|---|---|
| Seleccionar un proveedor muestra solo sus citas | `app/(admin)/appointments/page.test.tsx:562` |
| Seleccionar varios proveedores muestra solo los elegidos | `page.test.tsx:585` |
| Sin selección se muestran todos los proveedores | `page.test.tsx:604` |
| El filtrado precede al agrupamiento por día | `page.test.tsx:634` |
| La selección se refleja en la URL y es deep-linkable | `page.test.tsx:659`, `page.test.tsx:678` |
| La selección sobrevive el cambio Lista ↔ Calendario | `page.test.tsx:796` |
| "Limpiar filtros" reinicia ambos filtros del calendario | `page.test.tsx:695`, `page.test.tsx:1293` |
| El botón "Limpiar filtros" se muestra cuando cualquiera está activo | `page.test.tsx:832`, `page.test.tsx:1329`, `page.test.tsx:1518` |
| La lista conserva su filtro de proveedor de un solo valor | `page.test.tsx:759`, `page.test.tsx:778` |
| Ids desconocidos en la URL no rompen el calendario | `page.test.tsx:738` |
| La fila de filtros es usable en móvil | `page.test.tsx:832`, `page.test.tsx:1417` |
| Los controles de filtrado son operables por teclado | `src/components/admin/calendar/__tests__/ProviderLegend.test.tsx:107` |

### Requisito AGREGADO — filtro de servicios (16)

| Escenario | Prueba |
|---|---|
| Seleccionar un servicio muestra solo sus citas | `page.test.tsx:936` |
| Seleccionar varios servicios muestra solo los elegidos | `page.test.tsx:965` |
| Sin selección se muestran todos los servicios | `page.test.tsx:995`, `ServiceFilter.test.tsx:33` |
| El filtro de servicios se compone con AND con el de proveedores | `page.test.tsx:1036` |
| El filtrado de servicios precede al agrupamiento por día | `page.test.tsx:1077` |
| La selección de servicios se refleja en la URL y es deep-linkable | `page.test.tsx:1108`, `page.test.tsx:1136` |
| La URL compone la selección de servicios con la de proveedores | `page.test.tsx:1167`, `page.test.tsx:1205` |
| La selección de servicios sobrevive el cambio Lista ↔ Calendario | `page.test.tsx:1243` (aserción `:1284`) |
| El control de servicios conserva el universo del mes | `page.test.tsx:1390`, `page.test.tsx:1284`, `ServiceFilter.test.tsx:46` |
| Las entradas del control de servicios son solo nombre | `ServiceFilter.test.tsx:74` |
| Los controles de servicios son operables por teclado | `ServiceFilter.test.tsx:159` |
| Sin filtrado el control comunica que se muestran todos | `ServiceFilter.test.tsx:33`, `ServiceFilter.test.tsx:142`, `page.test.tsx:995` |
| Ids desconocidos en la URL no rompen el calendario | `page.test.tsx:1390`, `ServiceFilter.test.tsx:111` |
| La fila con el control de servicios es usable en móvil | `page.test.tsx:1417` |
| La misma acción "Limpiar filtros" deja el filtro en "todos" | `page.test.tsx:1293`, `page.test.tsx:1518` |
| La lista conserva su filtro de servicio de un solo valor | `page.test.tsx:1360` |

Se leyeron las pruebas para verificar representatividad en: composición AND
(`page.test.tsx:1036-1076`), pre-agrupamiento con día mixto (`:1077-1107`), URL
exacta con ambos parámetros y `providerId` primero (`:1167-1204`), recarga por
deep link (`:1205-1242`), supervivencia al cambio de vista (`:1243-1291`),
"Limpiar filtros" con ambos activos (`:1293-1328`), preservación de la URL exacta
de #174 con solo `providerId` (`:659-677`) e ids desconocidos (`:1390-1416`).

## Comprobación de diseño (D1–D24, puntos de mayor riesgo)

- **D4** clases exactas: `src/components/admin/calendar/ServiceFilter.tsx:13-19`;
  verificadas en `ServiceFilter.test.tsx:74`.
- **D5** sin swatch ni `backgroundColor`: `querySelectorAll('[style]')` = 0 y sin
  `legend-swatch` (`ServiceFilter.test.tsx:85`).
- **D12** `visibleServices` derivado de `appointments` **sin filtrar**:
  `page.tsx:279-289`.
- **D14** guards AND antes de `blocksByDay`: `page.tsx:242-254`; `blocksByDay` en
  `page.tsx:256`.
- **D15/D17** orden de parámetros y escritura única: `page.tsx:190-196`,
  `router.replace` único en `page.tsx:306`.
- **Desviación `.replace(/%2C/g, ',')`**: `page.tsx:194`, documentada en
  `page.tsx:191-193`. Solo afecta la codificación de la coma de separación; los
  ids son UUID (`[0-9a-f-]`), por lo que no puede alterar otro contenido, y es
  **necesaria** para conservar la forma exacta de URL de #174, confirmada por
  `page.test.tsx:659` y `page.test.tsx:880`.
- **D16** guard dual de reescritura redundante: `page.tsx:294-308`.
- **D18** limpieza de ambos filtros: `applyCalendarFilters([], [])` y render con
  cualquiera de los dos activo.
- **D20** Lista intacta: el diff no toca `serviceFilter` (`page.tsx:220`),
  `providerFilter` (`page.tsx:222`), `filteredAndSortedAppointments`
  (`page.tsx:497`), `hasActiveFilters` (`page.tsx:546`) ni el `<select>`.
- `ProviderLegend.tsx` sin cambios; `package.json` sin cambios; `travelhub-app`
  intacto.

## Hallazgos

- **CRÍTICO**: ninguno.
- **MAYOR**: ninguno.
- **MENOR 1 — referencias de línea obsoletas en `design.md`**: `design.md:444`
  (y `:289`) citan `page.tsx:158-163`, pero `calendarFilterUrl` vive en
  `page.tsx:190-196`; `design.md:340` cita `:243-252` frente a `311-325` real;
  `design.md:376` y `:447` citan `:606-614` frente a `694-704` real. El ancla
  sustantiva es correcta; solo el número de línea quedó desfasado tras el Apply.
- **MENOR 2 — fragmento de `design.md` §2.6 desincronizado**: `design.md:292-296`
  muestra `params.toString()` sin `.replace(/%2C/g, ',')`, mientras el código sí
  lo aplica (`page.tsx:194`). El reemplazo es indispensable para cumplir el propio
  objetivo declarado en §2.6 (preservar las aserciones exactas de URL de #174);
  la desviación está documentada en el comentario de `page.tsx:191-193`, no en
  `design.md`.
- **MENOR 3 (observación) — distinción de estado con tono/borde**: las entradas
  usan `text-gray-700`+`border-gray-300` frente a `text-gray-500`+
  `border-transparent`. Se mitiga con `aria-pressed` (semántica no cromática) y
  con el contraste AA declarado en D5; no se midió con herramienta.

## No verificado / límites

- El contraste AA es una afirmación de `design.md` (D5); no se midió con
  herramienta de contraste.
- "Operable por teclado" y "usable en móvil" se verificaron a nivel DOM y de
  clases (`aria-pressed`, `flex-col`/`sm:flex-row`), no en navegador real con
  teclado o touch.
- `design.md` y `tasks.md` son artefactos de la propuesta: `tasks.md:535`
  (build, tarea 14.5) sigue marcado `[ ]` aunque el build ya pasa.

## Estado del árbol

Esperado y sin mutaciones no previstas: `M app/(admin)/appointments/page.tsx`,
`M app/(admin)/appointments/page.test.tsx`,
`?? openspec/changes/agregar-filtro-servicios-calendario/`,
`?? src/components/admin/calendar/ServiceFilter.tsx`,
`?? src/components/admin/calendar/__tests__/ServiceFilter.test.tsx`. La ejecución
de `npm run build` generó `.next/` (ignorado por git). No se modificó, corrigió ni
confirmó ningún archivo.
