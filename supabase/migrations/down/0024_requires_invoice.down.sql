-- Down migration para la marca "requiere factura" de pagos.
-- PRECAUCIÓN: la reversa descarta la marca capturada en cada pago.

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS requires_invoice;
