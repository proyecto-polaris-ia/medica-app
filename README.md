# medica-app

Sistema de agenda y atención por WhatsApp para un consultorio dental.

## Qué es

Permite que un paciente escriba por WhatsApp y reciba respuesta inmediata del
agente **Eve** (framework Vercel Eve), que:

1. Responde **conocimiento estático** (preguntas frecuentes aprobadas).
2. Consulta **disponibilidad dinámica** de la agenda (días, horas, citas,
   clientes, servicios) y reserva un horario real.
3. Escala a un humano cuando no puede responder con seguridad (dolor, urgencia,
   receta, costo, etc.).

El webhook `app/api/whatsapp/webhook/route.ts` solo verifica la firma de Meta y
reenvía cada mensaje a `/eve/v1/whatsapp`; el agente vive en `agent/`. El **web
chat** del sitio (`app/api/web-chat/message`) es un canal aparte y sigue usando
el Flow Engine determinístico (`src/lib/flows/`).

## Stack

- **Vercel** (Next.js App Router) — webhook de WhatsApp + API + agente Eve.
- **Supabase** (Postgres) — fuente de verdad: agenda, pacientes, servicios,
  proveedores, conocimiento, conversaciones.
- **Meta WhatsApp Cloud API** — canal de entrada/salida.
- **LLM configurable** — interpreta intención y redacta; nunca decide
  disponibilidad ni escribe en BD por sí solo.

## Configuración

La lista de variables de entorno vive en [`.env.local.example`](.env.local.example)
y en [`architecture.md`](architecture.md) (sección 9). El detalle operativo del
agente Eve (monitoreo y rollback) está en
[`docs/eve-runbook.md`](docs/eve-runbook.md).

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


<a href="https://github.com/Gentleman-Programming/gentle-ai">
  <img width="220" src="https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png" alt="Built with Gentle-AI" />
</a>
