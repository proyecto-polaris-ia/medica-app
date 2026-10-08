# Change: Preferencia de zona horaria por usuario (presentación admin, issue #163)

## Why

El consultorio ya no opera sólo en `America/Mexico_City`: hay personal
administrativo que trabaja desde otras zonas (por ejemplo Pacífico
`America/Los_Angeles` y Centro `America/Mexico_City`). Hoy **toda** hora se
presenta en la zona de la clínica (`America/Mexico_City`) o, en algunos
surfaces, en la zona del navegador, y ninguna superficie deja que cada quien
vea la agenda en su propia zona.

Historia de usuario (ejemplo del issue #163):

- La coordinadora en Tijuana (`America/Los_Angeles`) crea una cita para las
  15:00 de su hora. El instante queda fijo en `timestamptz` (15:00 Pacific =
  22:00Z en horario de verano).
- Un compañero en Ciudad de México (`America/Mexico_City`) abre la misma cita y
  debe verla a las 17:00 de su hora, no a las 15:00 ni a la hora del
  navegador de quien la capturó.
- El mismo instante debe verse **igual en todas las vistas** de la cita
  (lista, calendario y modal), cada observador en su zona.

El instante de la cita ya es correcto y no se mueve: lo que falta es una
**preferencia de zona horaria por usuario** y una **presentación parametrizada**
de las horas para quien está viendo la pantalla.

## What Changes

### Capability deltas

- **`admin-panel`** (ADDED)
  - `User timezone preference` — preferencia persistida por usuario
    autenticado, validada como IANA, con `America/Mexico_City` como valor por
    defecto y aislamiento entre usuarios.
  - `Timezone preference settings UI` — superficie de configuración para ver y
    cambiar la zona horaria propia.
  - `Viewer timezone for admin date presentation` — el snapshot de proveedor,
    el WhatsApp command center y las vistas de expediente presentan horas en la
    zona del usuario que las ve.
- **`appointments-calendar-view`** (RENAMED + MODIFIED)
  - `Clinic timezone rendering` → `Viewer timezone rendering`: la lista, el
    calendario, el modal de captura y el expediente dentro de `/appointments`
    usan la zona del observador (default `America/Mexico_City`). La captura
    `datetime-local` se interpreta y se prellena en la zona del observador,
    mostrando explícitamente a qué zona corresponde lo capturado.

## Non-goals

- **Migración de instantes**: no se toca ni migra ningún `timestamptz`; los
  instantes almacenados no cambian. El cambio es de preferencia + presentación.
- **Lógica operativa de la clínica**: se mantiene en `America/Mexico_City`
  porque es operación del consultorio, no presentación dependiente del
  observador. Aplica a: recordatorios por WhatsApp, rondas de seguimiento
  (`follow-up`), notas diarias de Nora, **buckets y ventanas de métricas**,
  herramientas del agente Eva, default de `get_free_slots` en SQL y datos de
  seed/demo. Adaptar esta lógica a la zona del espectador/paciente será un
  cambio futuro.
- **Eva preguntando la zona horaria del paciente** con default configurable:
  cambio posterior explícito, no forma parte de este.
- **Wizard público de reserva** (`/booking`): queda fuera. Sus etiquetas de
  horario describen la hora del consultorio donde ocurre la cita y no hay
  preferencia por usuario anónimo; cambiarlas sin un flujo explícito de
  confirmación de zona del paciente introduciría riesgo de que el paciente
  elija una hora creyendo que es su hora local. Ver `design.md` §Decisiones.
- **Etiquetas/ventanas de métricas por observador**: las ventanas de métricas
  son buckets operativos de la clínica; sus límites y etiquetas de rango se
  mantienen en `America/Mexico_City`.
- Soporte multi-consultorio.

## Impact

| Archivo | Cambio |
|---|---|
| `supabase/migrations/<UTC-timestamp>_user_settings.sql` | New: tabla `user_settings` + RLS por usuario |
| `src/lib/admin/timezone.ts` | Modified: helpers parametrizados por `timeZone` (default `CLINIC_TZ`) + validador IANA |
| `src/lib/admin/clinic-time.ts` | Modified: `clinicDayRange`/`trailingDaysRange` aceptan `timeZone` (default clínica) |
| `src/lib/admin/user-settings.ts` | New: lectura/escritura de la preferencia |
| `app/api/admin/settings/timezone/route.ts` | New: GET/PUT de la preferencia del usuario autenticado |
| `app/(admin)/settings/page.tsx` + `src/components/admin/settings/TimezoneSettingsForm.tsx` | New: settings UI |
| `src/components/admin/TimezoneProvider.tsx` | New: contexto de zona para componentes cliente |
| `app/(admin)/layout.tsx` | Modified: lee preferencia, monta `TimezoneProvider`, agrega nav |
| `app/(admin)/appointments/page.tsx` | Modified: lista/modal/captura en zona del observador |
| `src/components/admin/calendar/{MonthCalendar,DayCell,ProviderLegend}.tsx` | Modified: zona del observador |
| `src/components/admin/PatientRecordView.tsx`, `src/components/admin/patient-record/PatientVisitsTab.tsx` | Modified: zona del observador |
| `src/components/admin/follow-up/FollowUpCaseCard.tsx` | Modified: zona del observador |
| `app/(admin)/dashboard/components/NoraSection.tsx` | Modified: zona del observador |
| `src/components/admin/ProviderSnapshot.tsx` | Modified: zona del observador |
| `src/lib/wcc-appointments.ts` | Modified: `formatWccAppointmentStart` parametrizado por observador |
| Tests de zona (`timezone.test.ts`, `clinic-time.test.ts`, `appointments/page.test.tsx`, etc.) | Modified/New |

## Rollback Plan

Cambio aditivo y de bajo riesgo: los instantes nunca se mueven y la
presentación cae por default a `America/Mexico_City`, que es la convención
vigente. Rollback = revertir el commit/PR en la rama:

- La migración `<UTC-timestamp>_user_settings.sql` es aditiva (tabla nueva); revertir el
  código deja la tabla sin uso y sin efecto observable.
- Quitar el lector de preferencia y los parámetros `timeZone` de los
  componentes cliente restaura la presentación en zona clínica sin tocar datos.
- No requiere limpieza de datos ni migración inversa.

## Capability

### Modified Capabilities

- `admin-panel`: nuevas capacidades de preferencia y presentación por usuario.
- `appointments-calendar-view`: el requisito de zona horaria pasa de zona
  clínica fija a zona del observador con default clínica.
