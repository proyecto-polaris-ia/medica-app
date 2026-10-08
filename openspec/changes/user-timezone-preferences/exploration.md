# Exploration — user-timezone-preferences (issue #163)

Fuente: `gentle-ai-explore` (task muz78wtm-1-nm1f), 2026-09. Reporte original en inglés; se conserva sin traducir como evidencia.

## Summary

Two canonical timezone libs exist — `src/lib/admin/clinic-time.ts` (day-range math, `clinicDayRange`/`trailingDaysRange`) and `src/lib/admin/timezone.ts` (`CLINIC_TZ`, `clinicDayKey`, `clinicTimeLabel`, `toClinicLocalInput`, `clinicLocalInputToUtc`, `clinicMonthRangeUtc`, `getCalendarGrid`, `groupAppointmentsByDay`, `getCurrentClinicMonth`, `FALLBACK_COLOR`). Both hard-code `'America/Mexico_City'` at `clinic-time.ts:1` and `timezone.ts:1`.

## 1. Timezone hard-coding map

**Core libs (server, pure):**
- `src/lib/admin/clinic-time.ts:1` — `CLINIC_TIME_ZONE`; `clinicDayRange(now)` (:81), `trailingDaysRange(now, days)` (:90), Intl-based parts/offset math.
- `src/lib/admin/timezone.ts:1` — `CLINIC_TZ`; label/input helpers (:59 `clinicDayKey`, :69 `clinicTimeLabel`, :93 `toClinicLocalInput`, :104 `clinicLocalInputToUtc`, :118 `clinicMonthRangeUtc`, :158 `getCalendarGrid`, :196 `groupAppointmentsByDay`, :189 `getCurrentClinicMonth`).

**Admin app (Next.js `app/(admin)/`):**
- `app/(admin)/appointments/page.tsx` — `'use client'` (:1); datetime-local inputs (:749, :760); wraps capture via `clinicLocalInputToUtc` (:17,:63) and `toClinicLocalInput` (:24,:59); local `Intl.DateTimeFormat` with `'America/Mexico_City'` (:70). Client.
- `app/(admin)/appointments/page.test.tsx:380` — "clinic-timezone rendering" suite. Test.
- `app/(admin)/providers/page.tsx:11` — imports `FALLBACK_COLOR` (only that).
- `app/(admin)/dashboard/components/NoraSection.tsx:4` — `clinicDayKey`, `clinicTimeLabel` (client component).
- `app/(admin)/dashboard/page.test.tsx:122`, `dashboard/__tests__/nora-section.test.tsx:55` — fixtures assuming UTC−6.
- `src/components/admin/calendar/*` — `MonthCalendar.tsx:1-2`, `DayCell.tsx:1-2`, `ProviderLegend.tsx:1` (client).
- `src/components/admin/PatientRecordView.tsx:2`, `components/admin/patient-record/PatientVisitsTab.tsx:5` — `CLINIC_TZ` for date rendering (client).
- `src/components/admin/follow-up/FollowUpCaseCard.tsx:7` — hard-coded `Intl` TZ `'America/Mexico_City'` (client).

**Server libs / API:**
- `src/lib/admin/provider-snapshot.ts:3,46-47` — `clinicDayRange`/`trailingDaysRange` for "today agenda" + recent days (server lib; also `app/(admin)/dashboard` usage via `ProviderSnapshot.tsx:11` which hard-codes Intl TZ).
- `src/lib/admin/metrics/trend.ts:13`, `range.ts:13`, `occupancy.ts`, `loader.ts:14` — `CLINIC_TZ`, `clinicDayKey`, `clinicMonthRangeUtc` for metrics day buckets (server).
- `src/lib/admin/follow-up/follow-up.ts:2,176` — `clinicDayKey` defines the round key (server).
- `src/lib/admin/nora/loader.ts:31`, `apply.ts:22`, `gaps.ts:17` — clinic TZ for suggestions/notes `[YYYY-MM-DD HH:mm America/Mexico_City]` (server).
- `src/lib/citas/send-appointment-reminder.ts:1-2,22,135` — clinic-day range + time label for WhatsApp reminders (server).
- `src/lib/citas/reminder-reply.ts:172` — hard-coded `'America/Mexico_City'` for audit-note timestamps (server).
- `src/lib/citas/reminder-reply-messages.ts:8` — `clinicTimeLabel` (server).
- `src/lib/wcc-appointments.ts:1,94` — `clinicDayKey`/`clinicTimeLabel` for command-center rendering (server).
- `src/lib/date-format.ts:5` — `Intl` TZ `'America/Mexico_City'` (es-MX medium format).
- `src/lib/admin/follow-up/draft-llm.ts:90` — `Intl` TZ (server).
- `src/lib/web-chat/web-inbound-service.ts:489,498,506` — hard-coded Intl TZ (server).
- `src/lib/booking/availability.ts:18`, `next-available.ts:20` — `timezone = 'America/Mexico_City'` default param in `getFreeSlots`/next-available (server).
- `src/components/booking/SlotStep.tsx:8,15`, `ConfirmStep.tsx:11`, `ResultStep.tsx:8` — public booking wizard renders slot labels with hard-coded Intl TZ (client).
- `agents/eva/agent/tools/{book,check-availability,get-next-available,list-my-appointments,reschedule}-appointment*.ts` — `CLINIC_TIMEZONE = "America/Mexico_City"` (each file, e.g. `book-appointment.ts:14`) (server, agent tools).
- `supabase/migrations/0004_agenda_functions.sql:10` — SQL `get_free_slots(p_clinic_tz text DEFAULT 'America/Mexico_City')`.
- `scripts/demo/seed-demo-data.sql:50,231...` — `v_today := (now() at time zone 'America/Mexico_City')::date`; all seed instants via `at time zone 'America/Mexico_City'`.

## 2. Users model

- **Auth**: Supabase Auth (SSR). `middleware.ts:2` → `src/lib/supabase/middleware.ts` `updateSession` refreshes cookies; `src/lib/supabase/auth.ts:22-30` `createSupabaseServerClient` via `@supabase/ssr` + `cookies()`; `getCurrentUser()` (:43) / `requireUser()` (:55) call `supabase.auth.getUser()`. API routes re-export via `app/api/admin/_lib/auth.ts`.
- **No profiles/settings table exists.** No migration creates `profiles`, `user_settings`, or any `staff`/`admin_users` table (checked all 29 migrations under `supabase/migrations/`). Identity is purely `auth.users` (Supabase managed); RLS policies in migrations (e.g. `0006_whatsapp_inbound_command_center.sql:228-235`, `0020_follow_up_contacts.sql:59`) use the pattern `USING ((SELECT auth.uid()) IS NOT NULL)` — i.e., any authenticated user is "admin".
- **Precedent for adding a table**: `supabase/migrations/0005_providers_color.sql` (column add + RLS "authenticated only" pattern). A per-user timezone would either be a new `user_settings(user_id uuid pk references auth.users, timezone text)` table with RLS `auth.uid() = user_id`, or a `raw_user_meta_data` field in Supabase Auth.

## 3. Datetime capture flows

- **Admin appointments modal** (the only `datetime-local` UI): `app/(admin)/appointments/page.tsx:749,760` (`start_at`/`end_at`), converted with `clinicLocalInputToUtc` (:63) on submit and prefilled with `toClinicLocalInput` (:59). Both helpers in `timezone.ts:93-122`.
- **Public booking wizard**: `src/components/booking/*` — date selection is day-key based (no datetime-local); slots come from `getFreeSlots` (`src/lib/booking/availability.ts:18`) with clinic-TZ default; labels rendered with hard-coded Intl TZ (`SlotStep.tsx:8,15`, `ConfirmStep.tsx:11`, `ResultStep.tsx:8`).
- **API validation**: `app/api/booking/_lib/validate.ts:22` — "Noon UTC prevents timezone off-by-one when the clinic timezone is UTC-6/-7" for date-only capture.
- **Agent tools** (`agents/eva/agent/tools/*`) — resolve local times via clinic TZ constant.
- **SQL**: `0004_agenda_functions.sql` takes `p_clinic_tz` param.

## 4. Tests

- `src/lib/admin/__tests__/clinic-time.test.ts` — `clinicDayRange`/`trailingDaysRange`; injects `now` as an explicit `Date` argument (pure functions take `now`, no clock mocking).
- `src/lib/admin/__tests__/timezone.test.ts` — `CLINIC_TZ` value (:13), round-trip `toClinicLocalInput`/`clinicLocalInputToUtc` (:56-88).
- `src/lib/admin/__tests__/provider-snapshot.test.ts:117` — "returns today agenda in America/Mexico_City".
- `src/lib/admin/follow-up/__tests__/follow-up.test.ts:136` — UTC↔clinic-day boundary.
- `src/lib/admin/nora/__tests__/{gaps,suggestions,apply.local,loader.local}.test.ts` — helper `utcFromLocalHour` assuming UTC−6 fixed.
- `src/lib/citas/__tests__/` — `send-appointment-reminder.test.ts:91` (`START_AT = '2026-10-05T16:00:00.000Z'` = 10:00 MX), `reminder-reply*.test.ts`, `appointment-status.test.ts:10`, `send-onboarding-nudge.test.ts:19`.
- `src/components/admin/follow-up/__tests__/FollowUpList.test.tsx:28,94-107`, `app/(admin)/appointments/page.test.tsx:380`, `app/(admin)/dashboard/page.test.tsx:122`, `dashboard/__tests__/nora-section.test.tsx:55`.
- E2E: `tests/e2e/helpers/db.ts:64`, `tests/e2e/helpers/booking.ts:4-17`; agent: `tests/agent/tools/check-availability.test.ts:52`.
- Pattern: tests pass explicit instants (fixed UTC ISO strings) rather than mocking the clock; several assume fixed UTC−6 "sin DST".

## 5. Existing per-user preferences patterns

**None found.** No `settings|Settings|preferences|theme|language` code in `src/` or `app/`. There is no per-user state anywhere — the closest analogs are provider-level config (`providers.color`, migration `0005_providers_color.sql`) and clinic-level config seeded in `0001_agenda_tables.sql`. A user-timezone feature would be the first per-user preference in the app; the established patterns to follow are: dedicated migration table with RLS `((SELECT auth.uid()) IS NOT NULL)`-style policies, server read via `src/lib/supabase/auth.ts` helpers, and pure-TS helper layer in `src/lib/admin/`.

## Uncertainties

- `app/(admin)/whatsapp-command-center/layout.tsx` and other admin pages not individually inspected for additional Intl TZ literals beyond the grep hits (grep appeared exhaustive under the 100-match limit).
- Whether Supabase Auth `raw_user_meta_data` is used anywhere for metadata could not be ruled out from migrations alone.
