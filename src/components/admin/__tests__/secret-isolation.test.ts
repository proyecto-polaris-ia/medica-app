import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const adminDir = path.resolve(__dirname, '..');
const authDir = path.resolve(__dirname, '../../auth');

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return getFiles(fullPath);
    }
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
      ? [fullPath]
      : [];
  });
}

describe('admin/auth component secret isolation', () => {
  const files = [...getFiles(adminDir), ...getFiles(authDir)];

  it.each(files)('%s does not import server secrets', (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(content).not.toContain('supabase/server');
  });
});
