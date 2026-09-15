# Widget de Chat Web — Documentación

## Descripción

Widget de chat embebible que permite a los pacientes del consultorio interactuar con el agente de IA a través de una página web. Funciona de manera independiente al canal de WhatsApp.

## Características

- ✅ **Consultas FAQ**: Responde preguntas sobre servicios, horarios, ubicación
- ✅ **Agendar citas**: Flujo completo de booking con disponibilidad en tiempo real
- ✅ **Cloudflare Turnstile**: Protección anti-spam con captcha
- ✅ **Teléfono obligatorio solo al agendar**: No se pide al inicio, solo cuando el paciente quiere confirmar una cita
- ✅ **Sin acceso a citas existentes**: Por seguridad, solo puede agendar nuevas citas (no consultar ni reprogramar)
- ✅ **Configurable**: Colores, nombre del consultorio y saludo personalizables

## Instalación

### 1. Configurar variables de entorno

En tu archivo `.env.local` (o en Vercel):

```bash
# Cloudflare Turnstile (recomendado para anti-spam)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=tu_site_key_aqui
TURNSTILE_SECRET_KEY=tu_secret_key_aqui

# Web Chat Widget
WEB_CHAT_ENABLED=true
WEB_CHAT_CLINIC_NAME=Consultorio Dental
WEB_CHAT_GREETING=¡Hola! Soy el asistente virtual del consultorio. ¿En qué puedo ayudarte?
WEB_CHAT_PRIMARY_COLOR=#2563eb
WEB_CHAT_ACCENT_COLOR=#1d4ed8
```

**Obtener claves de Turnstile:**
1. Ve a https://dash.cloudflare.com/
2. Selecciona "Turnstile" en el menú lateral
3. Crea un nuevo sitio y copia las claves

### 2. Ejecutar migración de base de datos

```bash
cd supabase/migrations
# Ejecuta 0012_web_chat.sql en tu base de datos Supabase
```

### 3. Embedder el widget en tu sitio web

Agrega este código HTML en la página donde quieras el widget (justo antes de `</body>`):

```html
<script src="https://medica-app.vercel.app/widget.js" async></script>
```

**Reemplaza** `medica-app.vercel.app` con tu dominio real de Vercel.

### 4. (Opcional) Controlar el widget con JavaScript

El widget expone una API global `window.MedicaChat`:

```javascript
// Abrir el chat
window.MedicaChat.open();

// Cerrar el chat
window.MedicaChat.close();

// Toggle (abrir/cerrar)
window.MedicaChat.toggle();
```

## Flujo del paciente

1. **Inicio**: El paciente abre el chat y ve el saludo
2. **Consultas**: Puede preguntar sobre servicios, horarios, ubicación sin proporcionar teléfono
3. **Agendar**: Si quiere agendar una cita, el flujo le pide:
   - Fecha deseada
   - Servicio
   - Doctor
   - Horario disponible (se muestran opciones)
4. **Confirmación**: Antes de confirmar la cita, se pide:
   - Nombre completo
   - Teléfono (formato E.164: +5215512345678)
   - Captcha Turnstile (si está configurado)
5. **Cita confirmada**: La cita se agenda en Supabase

## Restricciones de seguridad

- ❌ **No puede consultar citas existentes**: Solo agenda nuevas
- ❌ **No puede reprogramar citas**: Solo agenda nuevas
- ❌ **No puede cancelar citas**: Solo agenda nuevas
- ✅ **Teléfono obligatorio**: Solo al confirmar una cita
- ✅ **Captcha Turnstile**: Protege contra spam y bots
- ✅ **Rate limiting**: Implementado en los endpoints de API

## Arquitectura

```
Sitio web externo (HTML)
  ↓ <script src="widget.js">
Widget JS (iframe)
  ↓ Carga /widget
Página /widget (React)
  ↓ Fetch /api/web-chat/*
API Endpoints
  ↓ Procesa mensaje
Web Inbound Service
  ↓ Reutiliza Flow Engine
Flow Engine + Booking Actions
  ↓ Respuesta
Supabase (web_chat_sessions, web_chat_messages)
```

## Endpoints de API

### `GET /api/web-chat/config`
Retorna la configuración del widget (colores, saludo, etc.)

### `POST /api/web-chat/session`
Crea una nueva sesión de chat

**Response:**
```json
{
  "sessionId": "uuid",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### `POST /api/web-chat/message`
Procesa un mensaje del usuario

**Request:**
```json
{
  "sessionId": "uuid",
  "message": "Quiero agendar una cita",
  "phone": "+5215512345678",
  "fullName": "Juan Pérez",
  "captchaToken": "token_de_turnstile"
}
```

**Response:**
```json
{
  "reply": "¿Para qué día te gustaría agendar la cita?",
  "flowState": { ... },
  "requiresPhone": false,
  "booked": false,
  "needsHuman": false
}
```

## Personalización

### Colores
Edita las variables de entorno:
- `WEB_CHAT_PRIMARY_COLOR`: Color principal (botón, header)
- `WEB_CHAT_ACCENT_COLOR`: Color de acento

### Texto
- `WEB_CHAT_CLINIC_NAME`: Nombre que aparece en el header
- `WEB_CHAT_GREETING`: Mensaje inicial del agente

### Deshabilitar el widget
```bash
WEB_CHAT_ENABLED=false
```

## Diferencias con WhatsApp

| Característica | WhatsApp | Widget Web |
|----------------|----------|------------|
| Teléfono | Automático (del contacto) | Manual (se pide al agendar) |
| Consultar citas | ✅ Sí | ❌ No |
| Reprogramar citas | ✅ Sí | ❌ No |
| Cancelar citas | ✅ Sí | ❌ No |
| Agendar citas | ✅ Sí | ✅ Sí |
| FAQ | ✅ Sí | ✅ Sí |
| Escalar a humano | ✅ Sí | ✅ Sí |
| Captcha | ❌ No | ✅ Sí (Turnstile) |

## Troubleshooting

### El widget no aparece
- Verifica que `WEB_CHAT_ENABLED=true`
- Revisa la consola del navegador por errores CORS
- Asegúrate de que el script se carga desde el dominio correcto

### Error "Captcha verification required"
- Configura las variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`
- Obtén las claves en https://dash.cloudflare.com/

### Error "Session not found"
- La sesión expiró o fue eliminada
- Recarga la página para crear una nueva sesión

## Próximas mejoras

- [ ] Historial de conversaciones persistente
- [ ] Notificaciones por email al consultorio
- [ ] Widget personalizable por consultorio (multi-tenant)
- [ ] Soporte para archivos adjuntos (radiografías, documentos)
- [ ] Integración con expediente clínico
