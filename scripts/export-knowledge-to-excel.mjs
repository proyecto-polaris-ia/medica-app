#!/usr/bin/env node

/**
 * Exporta los artículos de conocimiento desde Supabase a un archivo Excel.
 * 
 * Uso:
 *   node scripts/export-knowledge-to-excel.mjs
 * 
 * El archivo se genera en docs/knowledge-entries.xlsx
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File may not exist, that's ok
  }
}

loadEnvFile(resolve(projectRoot, '.env.local'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Faltan variables de entorno de Supabase');
  console.error('Asegúrate de tener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function exportKnowledge() {
  console.log('Consultando artículos de conocimiento...');

  const { data, error } = await supabase
    .from('whatsapp_knowledge_entries')
    .select('id, topic, question, answer, tags, source, status, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error al consultar Supabase:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No hay artículos de conocimiento para exportar.');
    process.exit(0);
  }

  console.log(`Encontrados ${data.length} artículos.`);

  const rows = data.map((entry) => ({
    'ID': entry.id,
    'Tema': entry.topic,
    'Pregunta': entry.question,
    'Respuesta': entry.answer,
    'Etiquetas': Array.isArray(entry.tags) ? entry.tags.join(', ') : '',
    'Fuente': entry.source || '',
    'Estado': entry.status,
    'Creado': new Date(entry.created_at).toLocaleString('es-MX'),
    'Actualizado': new Date(entry.updated_at).toLocaleString('es-MX'),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  const colWidths = [
    { wch: 36 }, // ID
    { wch: 30 }, // Tema
    { wch: 50 }, // Pregunta
    { wch: 80 }, // Respuesta
    { wch: 30 }, // Etiquetas
    { wch: 20 }, // Fuente
    { wch: 12 }, // Estado
    { wch: 20 }, // Creado
    { wch: 20 }, // Actualizado
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Conocimiento');

  const outputPath = resolve(projectRoot, 'docs', 'knowledge-entries.xlsx');
  XLSX.writeFile(workbook, outputPath);

  console.log(`\n✅ Excel generado: ${outputPath}`);
  console.log(`   Total de artículos: ${data.length}`);
  console.log('\nEl cliente puede editar este archivo y devolverlo para cargar los cambios.');
}

exportKnowledge().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
