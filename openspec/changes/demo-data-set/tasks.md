# Tasks — demo-data-set

- [x] 1. Migración `demo_data_registry` + `demo_data_meta` (RLS admin_all, trigger updated_at)
- [x] 2. Generador `scripts/demo/seed-demo-data.sql` (idempotente, extensible, fechas relativas)
- [x] 3. Borrado `scripts/demo/remove-demo-data.sql` (orden FK-safe, solo filas registradas)
- [x] 4. Scripts npm `demo:seed` / `demo:wipe`
- [x] 5. Documentación `docs/datos-demo.md`
- [x] 6. Verificación local: seed → conteos → re-seed (sin duplicados) → wipe → re-seed
