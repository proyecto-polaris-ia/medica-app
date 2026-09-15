# Gestión de Artículos de Conocimiento

Este directorio contiene herramientas para exportar, editar e importar artículos de conocimiento del agente de WhatsApp.

## Archivos

- **`knowledge-entries.xlsx`** — Export actual de todos los artículos de conocimiento desde la base de datos. El cliente puede editar este archivo para modificar artículos existentes.

- **`knowledge-template.xlsx`** — Template vacío con ejemplos para agregar artículos nuevos. Incluye una hoja de instrucciones.

## Scripts

### Exportar artículos a Excel

```bash
node scripts/export-knowledge-to-excel.mjs
```

Genera `docs/knowledge-entries.xlsx` con todos los artículos actuales.

### Importar artículos desde Excel

```bash
node scripts/import-knowledge-from-excel.mjs [ruta-al-excel]
```

Si no se especifica ruta, usa `docs/knowledge-entries.xlsx` por defecto.

**Comportamiento:**
- Si la fila tiene columna **ID** → actualiza el artículo existente
- Si la fila NO tiene columna **ID** → crea un artículo nuevo
- Filas sin Tema, Pregunta o Respuesta → se saltan

### Crear template vacío

```bash
node scripts/create-knowledge-template.mjs
```

Genera `docs/knowledge-template.xlsx` con ejemplos e instrucciones.

## Flujo de trabajo

1. **Exportar**: Ejecutar `export-knowledge-to-excel.mjs` para obtener el Excel actual
2. **Enviar al cliente**: Enviar `knowledge-entries.xlsx` para que lo revise y edite
3. **Recibir**: El cliente devuelve el Excel editado
4. **Importar**: Ejecutar `import-knowledge-from-excel.mjs` con el archivo editado
5. **Verificar**: Revisar en el dashboard que los cambios se aplicaron correctamente

## Columnas del Excel

| Columna | Obligatorio | Descripción |
|---------|-------------|-------------|
| **ID** | No | UUID del artículo. Si existe, se actualiza. Si está vacío, se crea nuevo. |
| **Tema** | Sí | Categoría o tema del artículo (ej: "Horarios", "Servicios") |
| **Pregunta** | Sí | Pregunta que haría el paciente |
| **Respuesta** | Sí | Respuesta que debe dar el agente |
| **Etiquetas** | No | Palabras clave separadas por coma |
| **Fuente** | No | De dónde viene la información |
| **Estado** | No | `draft` (borrador), `approved` (aprobado), `archived` (archivado). Default: `draft` |

## Ejemplo de fila

```
ID: (vacío para crear nuevo)
Tema: Horarios de atención
Pregunta: ¿Cuáles son sus horarios?
Respuesta: Nuestros horarios son de lunes a viernes de 9:00 a 14:00 y de 16:00 a 20:00. Sábados de 9:00 a 14:00.
Etiquetas: horarios, atención, horario
Fuente: 
Estado: approved
```

## Notas

- Los artículos con estado `approved` son los que el agente usa para responder
- Los artículos `draft` no se usan hasta que se aprueben
- Los artículos `archived` se conservan pero no se usan
