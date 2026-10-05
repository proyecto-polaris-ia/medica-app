# Tareas: Activar pruebas e2e de Playwright para /booking

> Pronóstico de carga: 1 commit de unidad; ~5 archivos nuevos + `package.json`.
> ¿Decisión necesaria antes de apply? No.

## Fase 1 — Infraestructura

- [x] 1.1 Instalar `@playwright/test` como devDependency y navegadores de Playwright.
- [x] 1.2 Crear `playwright.config.ts`: proyectos `booking` y `booking-no-captcha`,
      webServer con env de prueba (Supabase local + claves Turnstile de prueba),
      puerto 3001, `testDir: tests/e2e`.
- [x] 1.3 Agregar scripts `pretest:e2e` (supabase start tolerante + db reset) y
      `test:e2e` en `package.json`.

## Fase 2 — Specs e2e

- [x] 2.1 Helper `tests/e2e/helpers/db.ts` (lectura/conteo vía `pg` contra la BD local).
- [x] 2.2 `booking-happy-path.spec.ts`: wizard completo hasta "¡Reserva confirmada!"
      + verificación de la cita en BD.
- [x] 2.3 `booking-negative.spec.ts`: POST sin captchaToken rechazado y sin fila en
      BD; degradación sin claves Turnstile; conflicto de doble reserva.

## Fase 3 — Verificación y cierre

- [x] 3.1 `npm run test:e2e` verde en ambos proyectos; corrida repetida pasa
      (determinismo).
- [x] 3.2 `npm run test`, `npm run typecheck`, `npm run lint` sin regresiones.
- [x] 3.3 Commit de unidad convencional y registro de evidencia en el feature doc.
