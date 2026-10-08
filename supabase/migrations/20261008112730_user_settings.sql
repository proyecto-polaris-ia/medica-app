-- Preferencia de zona horaria por usuario (change `user-timezone-preferences`,
-- design.md §D2). La preferencia es privada del usuario: la política RLS fuerza
-- `auth.uid() = user_id` en lectura y escritura, y el `service_role` queda fuera
-- del camino normal (la app lee/escribe con la sesión del usuario).
--
-- El CHECK sólo garantiza forma/longitud; la validez IANA la decide la capa de
-- aplicación (`isValidIanaTimeZone` en `src/lib/admin/timezone.ts`), porque
-- Postgres no trae una lista IANA portable.
--
-- Idempotente: tabla, trigger y policy usan guardas IF NOT EXISTS / DROP.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_timezone_shape
    CHECK (char_length(timezone) BETWEEN 3 AND 64)
);

-- Actualización de updated_at (patrón set_updated_at de 0006 / 0020; idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_settings_set_updated_at'
  ) THEN
    CREATE TRIGGER user_settings_set_updated_at
      BEFORE UPDATE ON public.user_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- RLS por dueño: sólo el propio usuario autenticado; anon nunca. FORCE evita
-- que el dueño de la tabla se salte la política (idioma de las migraciones 2026-10).
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;

DROP POLICY IF EXISTS "user_settings_owner_all" ON public.user_settings;
CREATE POLICY "user_settings_owner_all"
  ON public.user_settings
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
