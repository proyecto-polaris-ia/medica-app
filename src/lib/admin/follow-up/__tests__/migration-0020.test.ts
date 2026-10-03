import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrails estructurales de la Fase 3 (triangulación).
 *
 * El spec exige que **ningún** proceso programado envíe un borrador y que `anon`
 * no acceda a la tabla de borradores. Estas aserciones verifican el artefacto
 * fuente (migración 0020) y la ausencia de una ruta cron que envíe borradores.
 */

const REPO_ROOT = process.cwd();
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/0021_follow_up_message_drafts.sql'
);
const DOWN_MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/down/0021_follow_up_message_drafts.down.sql'
);

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe('migración 0020', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('crea el enum del ciclo de vida con guarda pg_type', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_type/);
    for (const status of [
      'draft',
      'approved',
      'rejected',
      'sending',
      'sent',
      'sent_failed',
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it('declara la tabla con dedup_key único e instantes timestamptz', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS follow_up_message_drafts/);
    expect(sql).toMatch(/dedup_key text NOT NULL UNIQUE/);
    expect(sql).toMatch(/approved_at timestamptz/);
    expect(sql).toMatch(/sent_at timestamptz/);
    expect(sql).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('crea los índices de cola por estado y join por paciente', () => {
    expect(sql).toMatch(
      /idx_follow_up_drafts_status\s+ON follow_up_message_drafts \(status, created_at DESC\)/
    );
    expect(sql).toMatch(
      /idx_follow_up_drafts_patient\s+ON follow_up_message_drafts \(patient_id, created_at DESC\)/
    );
  });

  it('activa RLS con force, revoca anon y concede solo a authenticated', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON follow_up_message_drafts FROM anon/);
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON follow_up_message_drafts TO authenticated/
    );
    expect(sql).toMatch(/follow_up_message_drafts_admin_all/);
  });
});

describe('down migration 0020', () => {
  it('revierte índices, tabla y enum en orden inverso', () => {
    const sql = readFileSync(DOWN_MIGRATION, 'utf8');
    const indexPos = sql.indexOf('DROP INDEX IF EXISTS idx_follow_up_drafts_status');
    const tablePos = sql.indexOf('DROP TABLE IF EXISTS follow_up_message_drafts');
    const typePos = sql.indexOf('DROP TYPE IF EXISTS follow_up_draft_status');
    expect(indexPos).toBeGreaterThanOrEqual(0);
    expect(tablePos).toBeGreaterThan(indexPos);
    expect(typePos).toBeGreaterThan(tablePos);
  });
});

describe('sin envío automático', () => {
  it('ninguna ruta cron referencia el envío de borradores', () => {
    const cronDir = path.join(REPO_ROOT, 'app/api/cron');
    const files = listFiles(cronDir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/sendFollowUpDraft/);
      expect(source).not.toMatch(/follow-up\/drafts/);
      expect(source).not.toMatch(/follow_up_message_drafts/);
    }
  });
});
