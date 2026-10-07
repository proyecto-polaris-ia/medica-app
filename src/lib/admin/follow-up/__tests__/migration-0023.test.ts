import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrails estructurales de la migración 0023 (auditoría de edición).
 *
 * El spec exige columnas aditivas, nullable e idempotentes: la edición humana
 * del texto solo agrega `edited_by`/`edited_at`, sin tocar RLS, policies ni
 * datos existentes. Estas aserciones revisan el artefacto fuente (up y down).
 *
 * Trampa evitada: el test vecino `migration-0020.test.ts` quedó con el nombre
 * desfasado y lee `0021_*.sql`. Este archivo se llama `migration-0023.test.ts`
 * y lee `0023_*.sql`, sin repetir el off-by-one.
 */

const REPO_ROOT = process.cwd();
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/0023_follow_up_draft_edit_audit.sql'
);
const DOWN_MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/down/0023_follow_up_draft_edit_audit.down.sql'
);

describe('migración 0023', () => {
  // Las aserciones de prohibición aplican solo a las sentencias, no a la prosa
  // de los comentarios.
  const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

  it('agrega edited_by uuid y edited_at timestamptz de forma idempotente', () => {
    expect(sql).toMatch(/ALTER TABLE follow_up_message_drafts/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS edited_by uuid/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS edited_at timestamptz/);
  });

  it('mantiene las columnas nullable, sin default ni FK', () => {
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
    expect(sql).not.toMatch(/REFERENCES/i);
  });

  it('no relaja RLS: sin policies, grants, revokes ni drops', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).not.toMatch(/\bREVOKE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});

describe('down migration 0023', () => {
  it('elimina edited_at y luego edited_by, en orden inverso', () => {
    const sql = readFileSync(DOWN_MIGRATION, 'utf8');
    const editedAtPos = sql.indexOf('DROP COLUMN IF EXISTS edited_at');
    const editedByPos = sql.indexOf('DROP COLUMN IF EXISTS edited_by');
    expect(editedAtPos).toBeGreaterThanOrEqual(0);
    expect(editedByPos).toBeGreaterThan(editedAtPos);
  });
});
