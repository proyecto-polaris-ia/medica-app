```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7d90b2196ba938c69f16f214e7d2f2052fbe14b8dda1c790e6410afdd4751b9c
verdict: fail
blockers: 1
critical_findings: 1
requirements: 2/2
scenarios: 16/16
test_command: npm run test
test_exit_code: 0
test_output_hash: sha256:d2b26784c4352f62086e219842770b27251830f280cd978bfe3e4d3c6fff0eb3
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:b2dc13f96e86307533d27456d7b0a7c669574fac660f3521a3eeea96efec27c8
```

## Reporte de verificación

**Cambio**: `patient-email-contact`  
**Versión**: N/A  
**Modo**: Strict TDD

### Completitud

| Métrica | Valor |
|---|---:|
| Requisitos | 2 |
| Escenarios | 16 |
| Tareas totales | 12 |
| Tareas completas | 12 |
| Tareas incompletas | 0 |

### Ejecución de build y pruebas

| Comando | Resultado | Evidencia |
|---|---|---|
| `npm run test` | ✅ 48 archivos, 299 pruebas | exit 0; `sha256:d2b26784c4352f62086e219842770b27251830f280cd978bfe3e4d3c6fff0eb3` |
| `npx tsc --noEmit` | ✅ Sin errores | exit 0; salida vacía `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `npm run build` | ✅ Next.js 15.5.24 compiló y generó rutas | exit 0; `sha256:b2dc13f96e86307533d27456d7b0a7c669574fac660f3521a3eeea96efec27c8` |
| `git diff --check` | ✅ Sin errores | exit 0; salida vacía `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `./scripts/verify-patient-email-contact-migration.sh` | ✅ Migración, invariantes, enlace WhatsApp, concurrencia y reversa | exit 0; `sha256:eb8b45e003886fbdbdd79d070e7283d1b81fa29361a2d0bfc644f4cfa8acd120` |

**Cobertura**: omitida; no hay una herramienta de coverage configurada.

### Matriz de cumplimiento de especificaciones

| Requisito | Escenario | Evidencia ejecutada | Resultado |
|---|---|---|---|
| Patients CRUD | Create and list a patient | servicio, POST y lista admin | ✅ COMPLIANT |
| Patients CRUD | Create and list a patient with email only | `patients.test.ts`, `route.test.ts`, `page.test.tsx` | ✅ COMPLIANT |
| Patients CRUD | Create and list a patient with both contacts | servicio, POST/PATCH y tabla admin | ✅ COMPLIANT |
| Patients CRUD | Patient without contact is rejected | servicio y POST/PATCH rechazan antes de persistir | ✅ COMPLIANT |
| Patients CRUD | Duplicate contact is rejected | conflicto `23505`, constraints e índice único parcial | ✅ COMPLIANT |
| Patients CRUD | Update a patient | servicio y PATCH cubren contactos nullable | ✅ COMPLIANT |
| Patients CRUD | Delete a patient | servicio y DELETE existentes | ✅ COMPLIANT |
| Patient resolution from contact | First booking creates a patient | `inbound-service.test.ts` + harness SQL de creación y enlace | ✅ COMPLIANT |
| Patient resolution from contact | Resolve by patientId | resolver y ruta de booking admin | ✅ COMPLIANT |
| Patient resolution from contact | Resolve by phone when patientId is absent | pruebas directas de búsqueda y creación phone-only | ✅ COMPLIANT |
| Patient resolution from contact | Resolve an internal booking by email only | normalización, resolver, ruta, wizard y payload | ✅ COMPLIANT |
| Patient resolution from contact | Both contacts identify the same patient | prueba directa del resolver | ✅ COMPLIANT |
| Patient resolution from contact | Matching patient is enriched only when a field is missing | actualización condicional, carrera concurrente y harness SQL | ✅ COMPLIANT |
| Patient resolution from contact | Contacts identify different patients | ruta normal y relectura posterior a `23505` comparan ambos propietarios | ✅ COMPLIANT |
| Patient resolution from contact | Internal booking without contact is rejected | resolver y ruta rechazan antes de crear paciente/cita | ✅ COMPLIANT |
| Patient resolution from contact | Public booking remains phone-first | pruebas públicas de teléfono inválido y CAPTCHA faltante/inválido | ✅ COMPLIANT |

**Resumen de cumplimiento**: 16/16 escenarios cumplen en la suite actual.

### Corrección estática

| Área | Estado | Evidencia |
|---|---|---|
| Invariantes de contacto en PostgreSQL | ✅ Implementado | `CHECK` de contacto, normalización, unicidad y reversa protegida; harness aislado verde. |
| Resolución posterior a carrera `23505` | ✅ Implementado | Relee teléfono y correo, compara propietarios y enriquece únicamente el contacto sin dueño. |
| CRUD y presentación nullable | ✅ Implementado | Tipos, servicios, rutas y UI manejan teléfono/correo nullable. |
| Separación de canales | ✅ Implementado | Booking público y WhatsApp siguen phone-first; no se agregó entrega de correo. |
| Vinculación de WhatsApp | ✅ Implementado | El orquestador vincula el contacto al paciente resuelto antes de reservar; prueba runtime sin envío real. |

### Coherencia con el diseño

| Decisión | ¿Se siguió? | Notas |
|---|---|---|
| Contactos nullable con al menos uno presente | ✅ Sí | Protegido en aplicación y base de datos. |
| Enriquecimiento mediante `UPDATE ... IS NULL` | ✅ Sí | Una carrera produce un solo ganador y la perdedora no sobrescribe. |
| Relectura determinista después de `23505` | ✅ Sí | Ambos propietarios se consultan y comparan antes de resolver. |
| Contratos separados por canal | ✅ Sí | Correo limitado al flujo interno/admin; público y WhatsApp conservan teléfono. |
| Tipos nullable sin casts que oculten `null` | ✅ Sí | Tipos compartidos y presentación manejan ausencia de contacto. |

### Cumplimiento TDD

| Verificación | Resultado | Detalle |
|---|---|---|
| Evidencia TDD reportada | ⚠️ Parcial | Existe tabla completa para la remediación, no para las 12 tareas originales. |
| Todas las tareas tienen pruebas | ✅ | Los comportamientos de las 12 tareas tienen cobertura vigente. |
| RED confirmado | ❌ | El propio `apply-progress.md` declara pruebas tardías y ausencia de RED histórico para varias tareas originales. |
| GREEN confirmado | ✅ | 299/299 pruebas pasan actualmente. |
| Triangulación adecuada | ✅ | Resolver, API, UI y harness cubren variantes de teléfono, correo, ambos, ninguno y carreras. |
| Safety net en archivos modificados | ⚠️ Parcial | Está documentado para la remediación; no existe evidencia previa por cada tarea original. |

**Cumplimiento TDD**: FAIL. La remediación siguió RED/GREEN para los dos defectos de producción, pero no puede convertir retroactivamente pruebas tardías del cambio original en evidencia Strict TDD.

### Distribución de capas de prueba relacionadas

| Capa | Pruebas | Archivos | Herramientas |
|---|---:|---:|---|
| Unidad | 47 | 5 | Vitest |
| Integración | 53 | 9 | Vitest + Testing Library / handlers y dependencias simuladas |
| E2E | 0 | 0 | No configurada |
| **Total** | **100** | **14** | |

### Cobertura de archivos modificados

Análisis omitido: no hay herramienta de coverage configurada en `package.json`.

### Calidad de aserciones

✅ No se encontraron tautologías, ghost loops ni casos sin invocar código de producción en los 14 archivos relacionados. Los usos de `toBeDefined()` tienen aserciones posteriores sobre payload o comportamiento.

### Métricas de calidad

**Linter**: ➖ No existe comando independiente; `next build` completó lint/type validation.  
**Type checker**: ✅ `npx tsc --noEmit` sin errores.

### Problemas encontrados

**CRITICAL**

1. El proceso original no demuestra Strict TDD para todas las tareas: `apply-progress.md` reconoce pruebas tardías y falta de RED/safety-net histórico. Con `strict_tdd: true`, la evidencia de proceso incompleta impide un PASS aunque el candidato actual sea funcionalmente conforme.

**WARNING**

1. No hay herramienta de coverage configurada; no fue posible medir cobertura por archivo modificado.

**SUGGESTION**

1. Configurar coverage de Vitest si el equipo necesita un umbral cuantitativo adicional; no cambia el cumplimiento funcional actual.

### Veredicto

**FAIL**

La implementación y los 16 escenarios están conformes y todos los comandos pasan, pero Strict TDD sigue sin estar demostrado para el cambio original. El bloqueo restante es de evidencia de proceso, no de comportamiento actual.

## Maintainer exception

On 2026-09-05, the maintainer explicitly accepted proceeding with delivery despite the Strict TDD historical-evidence blocker. This does not convert the verification verdict to PASS: the behavioral implementation is compliant, but the process deviation remains recorded for auditability.

Delivery status after exception:
- Functional requirements: 2/2 compliant.
- Spec scenarios: 16/16 compliant.
- Runtime checks: `npm run test`, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and `./scripts/verify-patient-email-contact-migration.sh` passed.
- Remaining blocker: historical Strict TDD RED provenance cannot be reconstructed retroactively.
