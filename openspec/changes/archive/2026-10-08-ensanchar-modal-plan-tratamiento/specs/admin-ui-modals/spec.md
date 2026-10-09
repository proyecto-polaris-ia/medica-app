# Delta Spec: Tamaño configurable de los modales de formulario

**Change**: ensanchar-modal-plan-tratamiento
**Capability**: `admin-ui-modals` (nueva)
**Baseline**: capacidad nueva; no existe spec previa en `openspec/specs/`

Alcance: el contrato observable del componente compartido `FormModal` en cuanto a
su ancho máximo y la legibilidad de los inputs numéricos de la tabla de ítems del
plan de tratamiento. No cambia ningún otro comportamiento del CRUD del panel
(capacidad `admin-panel`) ni el contrato de datos de planes (capacidad
`treatment-plans`).

## ADDED Requirements

### Requirement: Tamaño configurable del modal de formulario

`FormModal` MUST aceptar una prop opcional `size` con los valores
`'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'`. Cada valor MUST corresponder a un
ancho máximo del contenedor del modal: `sm` = `max-w-md` (448 px), `md` =
`max-w-lg` (512 px), `lg` = `max-w-2xl` (672 px), `xl` = `max-w-4xl` (896 px),
`2xl` = `max-w-6xl` (1152 px) y `full` = `max-w-full`. El contenedor MUST seguir
ajustándose al ancho disponible de la ventana (nunca excederlo).

#### Scenario: Cada tamaño aplica su ancho máximo

- GIVEN un consumidor que monta `FormModal` con `size="lg"`
- WHEN el modal se renderiza
- THEN su contenedor MUST tener el ancho máximo correspondiente a `lg`
  (`max-w-2xl`)
- AND MUST NOT exceder el ancho disponible de la ventana

#### Scenario: Tamaño no especificado

- GIVEN un consumidor que monta `FormModal` sin la prop `size`
- WHEN el modal se renderiza
- THEN el componente MUST comportarse como `md` (`max-w-lg`)

### Requirement: Tamaño por defecto compatible

El tamaño por defecto de `FormModal` MUST ser `md` (`max-w-lg`), idéntico al
ancho que el componente aplicaba antes de existir la prop `size`. Los call sites
existentes que no pasan `size` MUST conservar su apariencia y MUST NOT requerir
ninguna modificación.

#### Scenario: Los call sites existentes no cambian

- GIVEN los call sites vigentes de `FormModal` que no pasan `size`
- WHEN cualquiera de ellos renderiza su modal
- THEN el contenedor MUST conservar `max-w-lg`
- AND el layout de ese modal MUST ser equivalente al anterior

#### Scenario: Un call site que fija un tamaño no afecta a los demás

- GIVEN un call site que pasa `size="xl"` y otro que no pasa `size`
- WHEN ambos modales se renderizan en la misma sesión
- THEN el primero MUST usar `max-w-4xl`
- AND el segundo MUST seguir usando `max-w-lg`

### Requirement: Modal amplio para la captura del plan de tratamiento

El formulario de captura de plan de tratamiento MUST renderizar su modal con el
tamaño `xl` (`max-w-4xl`) para dar espacio suficiente a la tabla de ítems de 7
columnas. El ancho MUST ser mayor al que el formulario tenía antes del cambio
(`max-w-lg`).

#### Scenario: El plan de tratamiento abre amplio

- GIVEN un administrador autenticado que abre el modal de captura de plan de
  tratamiento
- WHEN el modal se renderiza
- THEN su contenedor MUST tener el ancho máximo `xl` (`max-w-4xl`)

#### Scenario: Los demás modales conservan su ancho

- GIVEN el modal de edición de consulta clínica abierto desde otra pestaña
- WHEN se renderiza
- THEN su contenedor MUST seguir usando el default `md` (`max-w-lg`)
- AND MUST NOT adoptar el ancho `xl` del plan de tratamiento

### Requirement: Inputs numéricos de la tabla del plan visibles y alineados

En la tabla de ítems del plan de tratamiento, el control de cantidad MUST mostrar
sin recortes un valor de al menos 5 dígitos y el control de precio unitario MUST
mostrar sin recortes un valor de al menos 8 dígitos. El texto de ambos controles
MUST alinearse a la derecha. El control de precio MUST exponer una pista de
teclado decimal (`inputMode="decimal"`) para capturar decimales. La columna
Diente MAY conservar su ancho reducido, por tratarse de notación FDI de longitud
corta.

#### Scenario: Cantidad de varios dígitos es visible completa

- GIVEN el modal de plan de tratamiento abierto en modo captura
- WHEN el administrador escribe una cantidad de al menos 5 dígitos
- THEN el valor completo MUST permanecer visible dentro del control
- AND el texto MUST estar alineado a la derecha

#### Scenario: Precio de varios dígitos es visible completo

- GIVEN el modal de plan de tratamiento abierto en modo captura
- WHEN el administrador escribe un precio unitario de al menos 8 dígitos
- THEN el valor completo MUST permanecer visible dentro del control
- AND el control MUST exponer `inputMode="decimal"`

#### Scenario: El ancho de Diente no cambia

- GIVEN la tabla de ítems del plan de tratamiento
- WHEN se renderiza la columna Diente
- THEN su control MUST conservar el ancho reducido original

### Requirement: Desbordamiento horizontal de la tabla en móvil

En pantallas estrechas, la tabla de ítems del plan de tratamiento MUST poder
desplazarse horizontalmente dentro del modal sin romper ni desbordar el layout
del modal. El contenedor de la tabla MUST conservar su comportamiento de scroll
horizontal.

#### Scenario: La tabla hace scroll en móvil sin romper el modal

- GIVEN el modal de plan de tratamiento abierto en una pantalla estrecha (móvil)
- WHEN el administrador desplaza horizontalmente la tabla de ítems
- THEN la tabla MUST ser desplazable horizontalmente
- AND el contenedor del modal MUST ajustarse a la ventana sin desbordarla

#### Scenario: El desplazamiento no altera los datos capturados

- GIVEN una cantidad y un precio ya capturados en la tabla
- WHEN el administrador desplaza la tabla horizontalmente
- THEN los valores capturados MUST permanecer sin cambios
