-- Marca "requiere factura" al registrar un pago manual.
-- Aditiva e idempotente: las filas existentes quedan en false.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS requires_invoice boolean NOT NULL DEFAULT false;
