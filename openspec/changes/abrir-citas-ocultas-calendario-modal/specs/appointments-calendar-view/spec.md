# Delta for Appointments Calendar View

**Change**: abrir-citas-ocultas-calendario-modal
**Baseline**: `openspec/specs/appointments-calendar-view/spec.md`

## ADDED Requirements

### Requirement: Acceso por desbordamiento del día
Cuando un día del calendario mensual contenga más citas de las que la celda
muestra visibles, la celda MUST renderizar el desbordamiento como un control
interactivo (`+N más`) que permita acceder a la lista completa de citas del día.
El control MUST ser un `<button>` nativo, MUST ser operable por teclado y MUST
comunicar mediante nombre accesible la acción y la cantidad de citas ocultas. El
control MUST NOT ser texto estático sin semántica interactiva. La grilla mensual
MUST conservar su altura uniforme: el desbordamiento MUST NOT expandir la celda.

#### Scenario: El desbordamiento es un botón accesible
- GIVEN un día con más de 4 citas en la vista de calendario
- WHEN la celda renderiza
- THEN el texto `+N más` MUST renderizarse como un `<button>` nativo
- AND MUST exponer un nombre accesible que indique ver las citas restantes del día
- AND MUST activarse con clic y con teclado (Enter/Space nativos del botón)

#### Scenario: La grilla no se deforma
- GIVEN un día con más de 4 citas
- WHEN el usuario ve la celda sin activar el desbordamiento
- THEN la celda MUST conservar su altura y las citas visibles MUST seguir limitadas a las primeras 4

### Requirement: Modal de citas del día
Al activar el control de desbordamiento de un día, la vista de calendario MUST
abrir un modal (`DayAppointmentsModal`) que muestre **todas** las citas de ese
día — las visibles y las ocultas — ordenadas por hora de inicio. El modal MUST
identificar el día en su título con la fecha legible. Cada cita del modal MUST
mostrar: hora, paciente, servicio, proveedor y estado; el estado MUST usar las
mismas etiquetas en español que la vista de Lista. Las notas de la cita MUST
mostrarse cuando existan. Si el paciente tiene expediente, su nombre MUST ser un
control que abra el expediente del paciente. Cada fila de cita MUST poder
activarse para abrir el formulario de edición de la cita, con el mismo
comportamiento que la selección de un bloque en la celda.

#### Scenario: El modal lista todas las citas del día ordenadas por hora
- GIVEN un día con 6 citas cuyas horas de inicio son 09:00, 10:30, 11:00, 13:00, 15:00 y 16:30
- WHEN el usuario activa el control `+2 más` de ese día
- THEN el modal MUST mostrar las 6 citas del día, no solo las ocultas
- AND MUST presentarlas ordenadas por hora de inicio ascendente
- AND el título MUST identificar la fecha del día

#### Scenario: Cada cita muestra sus datos completos
- GIVEN el modal de citas del día está abierto
- WHEN se renderiza una cita con servicio, proveedor, estado y notas
- THEN la fila MUST mostrar hora, paciente, servicio, proveedor y estado
- AND el estado MUST renderizarse con su etiqueta en español
- AND las notas MUST mostrarse cuando existan

#### Scenario: Abrir el expediente del paciente desde el modal
- GIVEN el modal de citas del día está abierto
- AND la cita visible pertenece a un paciente con expediente
- WHEN el usuario activa el nombre del paciente
- THEN la app MUST abrir el expediente del paciente mediante el callback existente de selección de paciente
- AND el modal del día MUST cerrarse

#### Scenario: Editar una cita desde el modal
- GIVEN el modal de citas del día está abierto
- WHEN el usuario activa una fila de cita
- THEN la app MUST abrir el formulario de edición de esa cita mediante el callback existente de selección de bloque
- AND el modal del día MUST cerrarse

### Requirement: Cierre y accesibilidad del modal
El modal de citas del día MUST renderizarse con `role="dialog"`, `aria-modal` y
un título referenciado por `aria-labelledby`. El modal MUST cerrarse con la tecla
Escape, con un clic en el fondo exterior al panel y con su botón de cierre. Al
abrirse, el modal MUST recibir el foco y el foco MUST permanecer dentro del
diálogo al ciclar con Tab. En pantallas pequeñas el panel del modal MUST ocupar
toda la pantalla; en pantallas mayores MUST renderizarse centrado con ancho
máximo, siguiendo el vocabulario visual de los modales existentes de la app.

#### Scenario: Cierre con Escape, fondo y botón ✕
- GIVEN el modal de citas del día está abierto
- WHEN el usuario presiona Escape, hace clic en el fondo o activa el botón ✕
- THEN el modal MUST cerrarse en cada uno de los tres casos

#### Scenario: Semántica de diálogo accesible
- GIVEN el modal de citas del día está abierto
- WHEN un lector de pantalla inspecciona el DOM
- THEN el contenedor MUST exponer `role="dialog"` y `aria-modal`
- AND MUST exponer el título del día como nombre accesible del diálogo
- AND el foco MUST quedar dentro del diálogo y ciclar con Tab dentro de él

#### Scenario: Panel responsivo
- GIVEN el modal de citas del día está abierto
- WHEN se visualiza en una pantalla pequeña
- THEN el panel MUST ocupar toda la pantalla
- WHEN se visualiza en una pantalla grande
- THEN el panel MUST renderizarse centrado con ancho máximo
