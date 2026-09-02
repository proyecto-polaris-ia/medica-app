# medica-app

Sistema de agenda y atención por WhatsApp para un consultorio dental.

## Qué es

Permite que un paciente escriba por WhatsApp y reciba respuesta inmediata de un
agente que:

1. Responde **conocimiento estático** (preguntas frecuentes aprobadas).
2. Consulta **disponibilidad dinámica** de la agenda (días, horas, citas,
   clientes, servicios) y reserva un horario real.
3. Escala a un humano cuando no puede responder con seguridad (dolor, urgencia,
   receta, costo, etc.).

## Stack

- **Vercel** (Next.js App Router) — webhook de WhatsApp + API + agente.
- **Supabase** (Postgres) — fuente de verdad: agenda, pacientes, servicios,
  proveedores, conocimiento, conversaciones.
- **Meta WhatsApp Cloud API** — canal de entrada/salida.
- **LLM configurable** — interpreta intención y redacta; nunca decide
  disponibilidad ni escribe en BD por sí solo.

## Lectura obligatoria

Antes de trabajar en este repo, lee:

- [`project.md`](project.md) — contexto de negocio (qué es y qué resuelve).
- [`architecture.md`](architecture.md) — contexto técnico (stack, componentes,
  modelo de datos, reutilización).

Ambos viven en la raíz del repo. También revisa [`AGENTS.md`](AGENTS.md).

## Flujo de trabajo (OpenSpec)

Los cambios se especifican y ejecutan con SDD/OpenSpec:

```
openspec/
├── specs/      <- specs fuente de verdad
└── changes/    <- cambios activos + archive
```

Ver `.agents/skills/_shared/openspec-convention.md` para la convención de
archivos.

## Estado

- [x] Documentación inicial (spec general + spec MVP).
- [ ] Scaffold de código (Next.js + Supabase).
- [ ] Migraciones de schema (agenda + WhatsApp).
- [ ] Agente dual (conocimiento estático + booking dinámico).
- [ ] Config webhook en Meta.
