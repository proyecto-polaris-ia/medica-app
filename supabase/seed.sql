-- Seed mínimo y determinista para desarrollo y pruebas contra Supabase local.
-- Se aplica automáticamente con `supabase db reset`.
-- Puertos locales (config.toml): API 54331, Postgres 54332, Studio 54333.
BEGIN;

INSERT INTO services (id, name, duration_minutes) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Valoración', 30),
  ('00000000-0000-4000-8000-000000000002', 'Limpieza', 45),
  ('00000000-0000-4000-8000-000000000003', 'Resina', 60)
ON CONFLICT (id) DO NOTHING;

INSERT INTO providers (id, name, color) VALUES
  ('00000000-0000-4000-8000-000000000101', 'Dra. Ejemplo', '#2563eb')
ON CONFLICT (id) DO NOTHING;

INSERT INTO business_hours (provider_id, day_of_week, start_time, end_time) VALUES
  ('00000000-0000-4000-8000-000000000101', 1, '09:00', '18:00'),
  ('00000000-0000-4000-8000-000000000101', 2, '09:00', '18:00'),
  ('00000000-0000-4000-8000-000000000101', 3, '09:00', '18:00'),
  ('00000000-0000-4000-8000-000000000101', 4, '09:00', '18:00'),
  ('00000000-0000-4000-8000-000000000101', 5, '09:00', '18:00')
ON CONFLICT DO NOTHING;

COMMIT;
