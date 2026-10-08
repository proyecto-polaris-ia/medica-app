# Change: Hora de cita consistente en zona clínica (lista, calendario y edición)

## Summary

Bug reportado en producción: la misma cita de `/appointments` mostraba horas
distintas según la vista. La cita de María Fernanda López García del 16/9 a las
17:00 (hora del consultorio) se veía 17:00 en **Lista** y en el **modal de
edición**, pero 16:00 en **Calendario**. Al editar desde lista y capturar "5 pm",
el calendario seguía mostrando "4 pm": parecía haber dos citas, pero era un solo
registro renderizado con dos zonas horarias distintas.

## Root Cause

La página de citas mezclaba zonas horarias:

- **Calendario**: zona clínica fija `America/Mexico_City` vía `clinicTimeLabel`
  (`src/lib/admin/timezone.ts`).
- **Lista**: `new Date(iso).toLocaleString('es-MX')` — zona del **navegador**.
- **Modal de edición**: `toLocalInput` / `fromLocalInput` con `new Date` — zona
  del navegador.

Con un equipo 1 h adelante de la zona clínica, capturar "17:00" en el modal
guardaba el instante UTC de las 16:00 clínicas; el calendario mostraba
fielmente 16:00 y la lista volvía a mostrar 17:00 (zona del navegador).

## What Changes

- **Helpers de zona clínica para inputs `datetime-local`** en
  `src/lib/admin/timezone.ts`: `toClinicLocalInput` (ISO → `YYYY-MM-DDTHH:mm`
  en hora clínica) y `clinicLocalInputToUtc` (input capturado → ISO UTC,
  interpretado SIEMPRE como hora clínica, nunca del dispositivo).
- **Página de Citas** (`app/(admin)/appointments/page.tsx`): lista, modal de
  edición y guardado usan los helpers; el formateador de fecha de la lista fija
  `timeZone: CLINIC_TZ`.
- **Expediente de paciente** (mismo defecto de clase):
  `PatientRecordView.tsx` y `PatientVisitsTab.tsx` fijan
  `timeZone: CLINIC_TZ` en sus formateadores de fecha/hora.

### Fuera de alcance

- **Issue #163 (multi zona horaria por usuario)**: feature aparte; este cambio
  solo restaura la convención vigente de zona clínica fija.
- Fechas sin componente de hora en otros módulos (dashboard, pagos).
- Migración de datos: los ISO en BD quedan como están; el fix es de
  lectura/escritura en el cliente.

## Capability

### Modified Capabilities

- `appointments-calendar-view`: el requisito "Clinic timezone rendering" se
  amplía del calendario a **todas** las vistas de la página de citas (lista,
  calendario, modal de edición) y a la **captura** del formulario.

## Impact

| Archivo | Cambio |
|---|---|
| `src/lib/admin/timezone.ts` | New exports `toClinicLocalInput`, `clinicLocalInputToUtc` |
| `app/(admin)/appointments/page.tsx` | Modified: `toLocalInput`, `fromLocalInput`, `formatDate` en zona clínica |
| `src/components/admin/PatientRecordView.tsx` | Modified: `timeZone: CLINIC_TZ` |
| `src/components/admin/patient-record/PatientVisitsTab.tsx` | Modified: `timeZone: CLINIC_TZ` |
| `src/lib/admin/__tests__/timezone.test.ts` | New tests de helpers (ida y vuelta, medianoche) |
| `app/(admin)/appointments/page.test.tsx` | New tests con `TZ=America/New_York` (regresión del bug) |

## Verification

- Tests RED→GREEN: los nuevos tests fallan contra el código anterior (verificado
  con `git stash`) y pasan con el fix.
- `npx tsc --noEmit` limpio; 107 tests de componentes admin y 13 de timezone
  pasan; `npm run test:local`: 1525 tests pasan (3 suites fallan de forma
  intermitente por contención del lock advisory de Postgres local — flakiness
  preexistente, archivos pasan individualmente).

## Status

✅ Fixed in commit `acde271` (`fix(admin): render appointment times in clinic timezone`).
