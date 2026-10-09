# Delta for Clinical Record

**Change**: ux-truncar-notas-evolucion
**Baseline**: `openspec/specs/clinical-record/spec.md` (capability existente)

## ADDED Requirements

### Requirement: Truncamiento de textos largos en la lista de notas SOAP
La lista de notas de evolución SOAP del panel (`PatientVisitsTab`) MUST
renderizar los campos de texto largo (`objective`, `assessment`, `plan`,
`treatment`, `notes`) a través de un comportamiento de truncamiento con
expansión bajo demanda. Cuando el texto del campo excede 150 caracteres, la
vista MUST mostrar los primeros 150 caracteres seguidos de `'...'` y un botón
"Ver más"; al activarlo MUST mostrar el texto completo y el botón MUST cambiar
a "Ver menos", que al activarse restaura el texto truncado. Cuando el campo es
`null` o tiene 150 caracteres o menos, MUST mostrar el contenido completo (o
el fallback `'—'` si es `null`) sin botón. El campo "Subjetivo", que encabeza
la card, MUST NOT truncarse. El estado de expansión MUST ser independiente
para cada campo y para cada nota de la lista.

#### Scenario: Texto corto se muestra completo sin botón
- GIVEN una nota SOAP cuyo campo `plan` tiene 80 caracteres
- WHEN la lista de notas renderiza la card
- THEN el campo `plan` muestra el texto completo
- AND no existe ningún botón "Ver más" asociado al campo

#### Scenario: Texto largo se trunca y se expande
- GIVEN una nota SOAP cuyo campo `objective` tiene 500 caracteres
- WHEN la lista de notas renderiza la card
- THEN el campo muestra exactamente los primeros 150 caracteres seguidos de `'...'`
- AND existe un botón "Ver más" con `aria-expanded="false"`
- WHEN el usuario activa el botón "Ver más"
- THEN el campo muestra el texto completo de 500 caracteres
- AND el botón muestra "Ver menos" con `aria-expanded="true"`

#### Scenario: Colapso restaura el texto truncado
- GIVEN un campo expandido tras activar "Ver más"
- WHEN el usuario activa el botón "Ver menos"
- THEN el campo muestra nuevamente los primeros 150 caracteres seguidos de `'...'`
- AND el botón vuelve a mostrar "Ver más" con `aria-expanded="false"`

#### Scenario: Campo nulo muestra el fallback
- GIVEN una nota SOAP cuyo campo `treatment` es `null`
- WHEN la lista de notas renderiza la card
- THEN el campo muestra `'—'`
- AND no existe ningún botón "Ver más" asociado al campo

#### Scenario: Estado de expansión independiente por campo
- GIVEN una nota SOAP con `assessment` y `notes` de más de 150 caracteres
- WHEN el usuario expande `assessment`
- THEN `assessment` muestra su texto completo
- AND `notes` permanece truncado con su botón en "Ver más"

#### Scenario: El subjetivo no se trunca
- GIVEN una nota SOAP cuyo campo `subjective` tiene 400 caracteres
- WHEN la lista de notas renderiza la card
- THEN el título de la card muestra el texto `subjective` completo
- AND no existe botón "Ver más" para el título
