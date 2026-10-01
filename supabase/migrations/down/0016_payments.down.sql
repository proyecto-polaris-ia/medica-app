-- Down migration para pagos manuales y reversos auditables.
-- PRECAUCIÓN: si existen pagos reales, retirar este esquema requiere aprobación
-- explícita y exportación/validación previa de datos financieros.

DROP INDEX IF EXISTS idx_payments_active_patient;
DROP INDEX IF EXISTS idx_payments_treatment_plan;
DROP INDEX IF EXISTS idx_payments_patient_paid_at;

DROP TABLE IF EXISTS payments;

DROP TYPE IF EXISTS payment_method;
