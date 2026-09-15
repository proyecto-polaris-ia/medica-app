# Checklist — Información requerida del cliente

Lista completa de lo que necesitamos pedirle al cliente (Jorge / consultorio dental) para configurar y personalizar el sistema.

---

## 1. Identidad y marca

- [ ] **Logo del consultorio** (PNG/SVG, alta resolución, fondo transparente si es posible)
- [ ] **Nombre oficial del consultorio** (como aparece en el letrero)
- [ ] **Eslogan o frase corta** (opcional, para el header del widget)
- [ ] **Colores de marca** (código hex si lo tienen, o muestra de colores)
  - Color primario (botones, header)
  - Color secundario/acento (opcional)
- [ ] **Tipografía preferida** (si tienen lineamientos de marca)

---

## 2. Información de contacto y ubicación

- [ ] **Dirección completa del consultorio** (calle, número, colonia, ciudad, CP)
- [ ] **Teléfono de contacto** (el que aparece en la página/web)
- [ ] **Correo electrónico de contacto**
- [ ] **WhatsApp del consultorio** (el número que usa el agente)
- [ ] **Redes sociales** (Facebook, Instagram, etc. — opcional)
- [ ] **Enlace a Google Maps** (para que el paciente llegue)

---

## 3. Horarios de atención

- [ ] **Horarios por día de la semana**
  - Lunes: hora apertura – hora cierre
  - Martes: hora apertura – hora cierre
  - ...
  - Domingo: ¿abren? ¿qué horario?
- [ ] **Horarios por doctor** (si cada doctor tiene su propio horario)
  - Dr. Jorge: lunes a viernes 17:00–20:00
  - Dr. Hijo: lunes a viernes 9:00–14:00
  - etc.
- [ ] **Días festivos o cierres especiales** (vacaciones, días inhábiles)

---

## 4. Servicios que ofrecen

Para cada servicio que quieren que aparezca en la página informativa y en el flujo de agendar:

| Servicio | Duración (minutos) | Descripción corta | Precio orientativo (opcional) |
|----------|-------------------|-------------------|-------------------------------|
| Ej: Limpieza dental | 30 | Limpieza profesional con ultrasonido | $500 |
| Ej: Extracción | 45 | Extracción simple | $800 |
| Ej: Valoración general | 20 | Revisión inicial | $300 |
| ... | ... | ... | ... |

- [ ] **Lista completa de servicios** con nombre y duración en minutos
- [ ] **Descripción breve de cada servicio** (1-2 oraciones para la página web)
- [ ] **Precio orientativo** (opcional, pero ayuda al paciente)
- [ ] **Fotos o íconos de cada servicio** (opcional, para la página web)

---

## 5. Doctores / proveedores

- [ ] **Nombre completo de cada doctor** (como quieren que aparezca)
- [ ] **Especialidad de cada doctor** (si aplica)
- [ ] **Foto de cada doctor** (para la página web — opcional)
- [ ] **Cédula profesional** (si quieren mostrarla — opcional)
- [ ] **Bio corta de cada doctor** (1-2 oraciones — opcional)

---

## 6. Preguntas frecuentes (Knowledge)

El agente responde preguntas rutinarias. Necesitamos que el cliente nos dé:

- [ ] **Preguntas que más hacen los pacientes** (con sus respuestas)
  - Ej: "¿Aceptan seguros?" → "Sí, aceptamos Seguros X, Y, Z"
  - Ej: "¿Tienen estacionamiento?" → "Sí, contamos con estacionamiento gratuito"
  - Ej: "¿Atienden niños?" → "Sí, atendemos pacientes de todas las edades"
  - etc.

**Formato de entrega:** Usar el Excel `docs/knowledge-template.xlsx` que ya generamos.

---

## 7. Mensajes y textos del agente

- [ ] **Saludo inicial del agente** (cuando el paciente abre el chat)
  - Ej: "¡Hola! Soy el asistente virtual de [Consultorio]. ¿En qué puedo ayudarte?"
- [ ] **Mensaje de despedida** (después de agendar una cita)
  - Ej: "¡Listo! Tu cita está confirmada. Te esperamos el [fecha] a las [hora]."
- [ ] **Mensaje de escalación a humano** (cuando el agente no puede resolver)
  - Ej: "Entendido. Una persona del consultorio te dará seguimiento en breve."
- [ ] **Mensaje de urgencia** (cuando el paciente reporta dolor fuerte, infección, etc.)
  - Ej: "Entiendo que es urgente. Por favor acude a urgencias o llama al [número]."

---

## 8. Configuración del widget web

- [ ] **Dominio donde se embedderá el widget** (para configurar CORS)
  - Ej: "www.consultoriojorge.com"
- [ ] **Texto del botón flotante** (si quieren personalizarlo)
  - Ej: "¿Necesitas ayuda?" o "Chatea con nosotros"
- [ ] **Posición del botón** (esquina inferior derecha por defecto)

---

## 9. Escalación y alertas

- [ ] **Número de WhatsApp para alertas** (a dónde llegan las escalaciones)
  - Ej: "+52 55 1234 5678" (celular de la secretaria)
- [ ] **Correo para notificaciones** (opcional)
- [ ] **Horario de atención para escalaciones** (¿a qué hora deben llegar las alertas?)

---

## 10. Datos adicionales (opcional pero recomendado)

- [ ] **Formas de pago aceptadas** (efectivo, tarjeta, transferencia, seguros)
- [ ] **Política de cancelación** (¿con cuánta anticipación pueden cancelar?)
- [ ] **Política de no asistencia** (¿qué pasa si no llegan?)
- [ ] **Requisitos para primera cita** (¿traer expediente? ¿llegar 10 min antes?)
- [ ] **Estacionamiento** (¿hay? ¿es gratuito? ¿cuántos espacios?)
- [ ] **Accesibilidad** (¿rampa para sillas de ruedas? ¿ascensor?)
- [ ] **Idiomas que hablan** (español, inglés, etc.)

---

## Resumen rápido

### Obligatorio (sin esto no podemos arrancar)

1. ✅ Nombre del consultorio
2. ✅ Dirección completa
3. ✅ Teléfono de contacto
4. ✅ Horarios de atención (por doctor si aplica)
5. ✅ Lista de servicios con duración en minutos
6. ✅ Nombre de doctores
7. ✅ Preguntas frecuentes (usando el template de Excel)
8. ✅ Número de WhatsApp para alertas

### Recomendado (mejora la experiencia)

- Logo y colores de marca
- Fotos de doctores
- Descripciones de servicios
- Precios orientativos
- Mensajes personalizados del agente

### Opcional (nice-to-have)

- Redes sociales
- Formas de pago
- Políticas de cancelación
- Información de accesibilidad

---

## Cómo entregar la información

1. **Excel de conocimiento**: Editar `docs/knowledge-template.xlsx` y devolverlo
2. **Servicios y doctores**: Llenar la tabla de servicios (sección 4) y lista de doctores (sección 5)
3. **Horarios**: Enviar tabla con horarios por día y por doctor
4. **Logo y marca**: Enviar archivos por correo o WeTransfer
5. **Todo lo demás**: Responder este checklist

---

## Notas

- Toda la información se guarda en Supabase y se usa para:
  - Widget web (página informativa + chat)
  - Agente de WhatsApp (respuestas y agendamiento)
  - Dashboard administrativo
- Los cambios se pueden hacer en cualquier momento a través del dashboard o enviando un Excel actualizado.
