-- Capacidad "nora-agenda-productiva" (Fase 2): sugerencias de reacomodo con
-- confirmación humana. La tabla es aditiva y NO toca el enum `appointment_status`
-- (invariante de `dashboard-metrics`); cada sugerencia tiene su propio ciclo de
-- vida en `status` (text + CHECK) y nunca mueve una cita por sí sola.
--
-- `original_start_at`/`original_end_at` registran el horario de la cita en el
-- momento de generarse la propuesta: son la referencia con la que la ruta de
-- aplicación detecta que la cita se movió y la sugerencia debe expirar
-- (design.md §5, escenario "Cita movida desde la propuesta expira").
--
-- Idempotente: tabla, índices y trigger usan guardas IF NOT EXISTS; patrón espejo
-- de 0018_appointment_reminders.sql.

CREATE TABLE IF NOT EXISTS public.nora_reschedule_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  original_start_at timestamptz NOT NULL,
  original_end_at timestamptz NOT NULL,
  suggested_start_at timestamptz NOT NULL,
  suggested_end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'expired', 'applied')),
  reason_code text NOT NULL
    CHECK (reason_code IN ('gap_before', 'gap_after', 'gap_between')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  CHECK (suggested_end_at > suggested_start_at)
);

-- Índices conforme design.md §3: bandeja por estado/fecha e historial por cita.
CREATE INDEX IF NOT EXISTS idx_nora_suggestions_status_created
  ON public.nora_reschedule_suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nora_suggestions_appointment
  ON public.nora_reschedule_suggestions (appointment_id, created_at DESC);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0018; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'nora_reschedule_suggestions_set_updated_at'
  ) THEN
    CREATE TRIGGER nora_reschedule_suggestions_set_updated_at
      BEFORE UPDATE ON public.nora_reschedule_suggestions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS: enable + force (mismo patrón que 0018). Nora es administrativa: nunca anon.
ALTER TABLE public.nora_reschedule_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nora_reschedule_suggestions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.nora_reschedule_suggestions FROM anon;
REVOKE ALL ON public.nora_reschedule_suggestions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nora_reschedule_suggestions TO authenticated;

-- Policy admin-all: solo usuarios autenticados (nunca anon).
CREATE POLICY "nora_reschedule_suggestions_admin_all"
  ON public.nora_reschedule_suggestions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
