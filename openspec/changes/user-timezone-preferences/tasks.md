# Tasks: user-timezone-preferences

Convención: `apply.tdd: true` en `openspec/config.yaml`. Cada tarea de
comportamiento escribe primero la prueba (RED), implementa lo mínimo (GREEN) y
cierra con triángulo de casos negativos/alternos. Cada tarea debe caber en una
sesión.

## 1. BD / migración

- [x] 1.1 Crear `supabase/migrations/YYYYMMDDHHMMSS_user_settings.sql` (timestamp UTC real al crear, convención vigente; no secuencial): tabla `public.user_settings` (`user_id uuid pk references auth.users(id) on delete cascade`, `timezone text not null default 'America/Mexico_City'`, `created_at`/`updated_at`, `CHECK` de longitud), `enable row level security`, grants a `authenticated`, revoke a `anon` y política `user_settings_owner_all` con `(select auth.uid()) = user_id` en `using` y `with check`. Verificar con `supabase db reset` local.
- [ ] 1.2 Escribir `src/lib/admin/__tests__/user-settings.test.ts` contra Supabase local (`localDbEnabled`, `src/test-utils/local-db.ts`): RED de get/set, default sin fila, normalización de valor inválido y aislamiento por usuario (RLS). Cubre el escenario "Preferencia privada" del delta `admin-panel`. **Nota de chain strategy: esta tarea se ejecuta en Chain 2 junto con 3.1 (el módulo que prueba se crea ahí).**

## 2. Núcleo tz parametrizado

- [x] 2.1 Parametrizar `src/lib/admin/timezone.ts` y `src/lib/admin/clinic-time.ts`: agregar parámetro opcional `timeZone` con default `CLINIC_TZ`/`CLINIC_TIME_ZONE` a `clinicDayKey`, `clinicTimeLabel`, `toClinicLocalInput`, `clinicLocalInputToUtc`, `clinicMonthRangeUtc`, `getCalendarGrid`, `getCurrentClinicMonth`, `groupAppointmentsByDay`, `clinicDayRange`, `trailingDaysRange`; agregar `isValidIanaTimeZone` y `resolveTimeZone` a `timezone.ts`. RED/GREEN en `src/lib/admin/__tests__/timezone.test.ts` y `src/lib/admin/__tests__/clinic-time.test.ts` (casos con `timeZone` explícito + casos actuales verdes). Sin cambios en llamados operativos.

## 3. Preferencia y settings UI

- [ ] 3.1 Crear `src/lib/admin/user-settings.ts` (`getUserTimezone`, `setUserTimezone` con validación y upsert vía `createSupabaseServerClient()`), `src/lib/admin/viewer-timezone.ts` (`getViewerTimezone` con `cache` de React) y `app/api/admin/settings/timezone/route.ts` (`GET`/`PUT` con `requireUser()`, `401` sin sesión y `400` con valor inválido). Completar 1.2 para get/set y validación.
- [ ] 3.2 Crear `src/components/admin/TimezoneProvider.tsx` (`TimezoneProvider`/`useViewerTimezone`, default `CLINIC_TZ`) y montarlo en `app/(admin)/layout.tsx` con la preferencia leída en servidor; agregar nav `Configuración` → `/settings`. Crear `app/(admin)/settings/page.tsx` y `src/components/admin/settings/TimezoneSettingsForm.tsx` (valor vigente, guardado válido, error sin sobrescribir). RED/GREEN: `TimezoneProvider.test.tsx` + test del formulario. Cubre "Timezone preference settings UI".

## 4. Presentación por vista

- [ ] 4.1 `app/(admin)/appointments/page.tsx` y `src/components/admin/calendar/{MonthCalendar,DayCell,ProviderLegend}.tsx`: usar `useViewerTimezone()` en lista, calendario y modal; prellenar con `toClinicLocalInput(iso, viewerTz)` y guardar con `clinicLocalInputToUtc(value, viewerTz)`; mostrar etiqueta de zona en la captura. Actualizar `app/(admin)/appointments/page.test.tsx` (suite de zona) con casos no-clínico y default clínico. Cubre el delta `appointments-calendar-view`.
- [ ] 4.2 Superficies servidor/expediente: `src/components/admin/ProviderSnapshot.tsx` y `app/(admin)/dashboard/components/NoraSection.tsx` reciben `timezone` por prop/`getViewerTimezone()`; `src/lib/wcc-appointments.ts` (`formatWccAppointmentStart`) y la página del command center usan la zona del observador; `src/components/admin/PatientRecordView.tsx`, `src/components/admin/patient-record/PatientVisitsTab.tsx` y `src/components/admin/follow-up/FollowUpCaseCard.tsx` usan `useViewerTimezone()`. RED/GREEN en `ProviderSnapshot.test.tsx`, `nora-section.test.tsx`, `dashboard/page.test.tsx` y `wcc-appointments.test.ts` con zona distinta a la clínica. Cubre "Viewer timezone for admin date presentation".

## 5. Verificación

- [ ] 5.1 `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] 5.2 `npm run test` (unit, `test_command` del config) y `npm run test:local` (datos/RLS contra Supabase local) en verde; `npm run build`; recorrer escenario por escenario las delta specs (`admin-panel`, `appointments-calendar-view`) y marcar cada `[ ]` con su evidencia.

## Workload forecast

Estimación: ~450–600 líneas de código (migración, helpers, preferencia,
settings UI, provider y retoques de presentación en ~18 archivos) más ~250–350
líneas de pruebas. El wizard público queda fuera (ver `design.md` §D8), pero el
conjunto sigue por encima del presupuesto cómodo de una sola revisión
(< ~400 líneas de código).

Chain strategy (PRs encadenados, cada uno revisable por separado):

1. **Chain 1 — BD + núcleo tz** (tareas 1.1–2.1): migración + helpers
   parametrizados + validador. Sin cambio de comportamiento (default clínica).
2. **Chain 2 — Preferencia y settings** (tareas 3.1–3.2): lib, API, provider,
   layout y settings UI. Depende de Chain 1.
3. **Chain 3 — Presentación por vista** (tareas 4.1–4.2): `/appointments`,
   superficies servidor, command center y expediente. Depende de Chain 2.

Decision needed before apply: Yes

Decisión del usuario (2026-10-08, ver odd/tasks/multi-timezone-app.md): 3 PRs
encadenados, estrategia Stacked PRs to main (cada slice aterriza independiente
en orden). Ajuste: 1.2 se ejecuta en Chain 2 junto con 3.1.
