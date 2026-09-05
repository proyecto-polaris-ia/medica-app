# Bug Fix: Año incorrecto en fechas de agendamiento

## Fecha
2026-09-05

## Commit
`f4ceadd` - fix(whatsapp): corregir año en fechas de agendamiento

## Problema
El agente de WhatsApp estaba creando citas en el año 2025 en lugar de 2026 cuando el usuario mencionaba fechas sin año (ej: "15 de septiembre").

## Causa raíz
1. El LLM no tenía contexto del año actual en su prompt
2. La función `parseLocalDate` no validaba si la fecha estaba en el pasado
3. Cuando el LLM generaba "2025-09-15", el sistema aceptaba esa fecha sin corrección

## Solución implementada

### 1. Contexto temporal en el prompt del LLM
Archivo: `src/lib/ai/whatsapp-llm-provider.ts`

Se agregó el año actual al system prompt:
```typescript
const currentYear = new Date().getFullYear();
// ...
Contexto temporal: El año actual es ${currentYear}. Cuando el usuario mencione fechas sin año (ej: "15 de septiembre"), usa el año actual ${currentYear}.
```

### 2. Validación de fechas en el pasado
Archivo: `src/lib/whatsapp/inbound-service.ts`

La función `parseLocalDate` ahora corrige fechas en el pasado:
```typescript
function parseLocalDate(value?: string) {
  if (!value) return new Date();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-06:00` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return new Date();
  
  // Si la fecha está en el pasado, corregir al año actual
  const now = new Date();
  if (parsed < now) {
    const currentYear = now.getFullYear();
    parsed.setFullYear(currentYear);
    // Si después de cambiar el año sigue en el pasado, usar fecha actual
    if (parsed < now) return now;
  }
  
  return parsed;
}
```

## Impacto
- Los usuarios ahora pueden decir "15 de septiembre" y el sistema interpreta correctamente el año actual
- Se previene la creación de citas en años pasados
- Fallback seguro: si la fecha sigue en el pasado después de corregir, usa la fecha actual

## Testing
- ✅ TypeScript compila sin errores
- ✅ 269 tests pasan
- ✅ Validado en producción

## Archivos modificados
- `src/lib/ai/whatsapp-llm-provider.ts`
- `src/lib/whatsapp/inbound-service.ts`
