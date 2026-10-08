-- payment_intents: add 'discord' as an intent source (issue #159, Fase 2).
-- Mora registers payment intents reported by authorized doctors through its
-- Discord channel; those intents carry source 'discord' instead of 'whatsapp'.
-- Idempotent: ADD VALUE is not wrapped in IF NOT EXISTS at type level, so we
-- guard with a catalog check and a compatible DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'discord'
      AND enumtypid = 'payment_intent_source'::regtype
  ) THEN
    ALTER TYPE payment_intent_source ADD VALUE 'discord';
  END IF;
END
$$;
