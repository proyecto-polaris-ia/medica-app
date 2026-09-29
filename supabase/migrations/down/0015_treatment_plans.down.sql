-- Down migration para planes de tratamiento (Fase 2 del expediente).
-- Revierte en orden inverso de dependencia: índices → tablas → tipos enum.

DROP INDEX IF EXISTS idx_treatment_plan_items_plan;
DROP INDEX IF EXISTS idx_treatment_plans_patient_created;

DROP TABLE IF EXISTS treatment_plan_items;
DROP TABLE IF EXISTS treatment_plans;

DROP TYPE IF EXISTS treatment_plan_item_status;
DROP TYPE IF EXISTS treatment_plan_status;
