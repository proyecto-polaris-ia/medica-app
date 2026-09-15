#!/usr/bin/env node

/**
 * Importa artículos de conocimiento desde un archivo Excel a Supabase.
 * 
 * Uso:
 *   node scripts/import-knowledge-from-excel.mjs [ruta-al-excel]
 * 
 * Si no se especifica ruta, usa docs/knowledge-entries.xlsx por defecto.
 * 
 * El Excel debe tener las columnas:
 *   - Tema (obligatorio)
 *   - Pregunta (obligatorio)
 *   - Respuesta (obligatorio)
 *   - Etiquetas (opcional, separadas por coma)
 *   - Fuente (opcional)
 *   - Estado (draft | approved | archived, default: draft)
 *   - ID (opcional, para actualizar entradas existentes)
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

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
    // File may not exist
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

function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return String(tagsStr)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

function validateStatus(status) {
  const valid = ['draft', 'approved', 'archived'];
  const s = String(status || 'draft').toLowerCase().trim();
  return valid.includes(s) ? s : 'draft';
}

async function importKnowledge(excelPath) {
  if (!existsSync(excelPath)) {
    console.error(`Error: No se encontró el archivo ${excelPath}`);
    process.exit(1);
  }

  console.log(`Leyendo archivo: ${excelPath}`);

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet);

  if (rows.length === 0) {
    console.log('El archivo está vacío. No hay artículos para importar.');
    process.exit(0);
  }

  console.log(`Encontradas ${rows.length} filas en el Excel.`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const id = row['ID'] || row['id'] || null;
    const topic = String(row['Tema'] || row['topic'] || '').trim();
    const question = String(row['Pregunta'] || row['question'] || '').trim();
    const answer = String(row['Respuesta'] || row['answer'] || '').trim();
    const tags = parseTags(row['Etiquetas'] || row['tags'] || '');
    const source = String(row['Fuente'] || row['source'] || '').trim() || null;
    const status = validateStatus(row['Estado'] || row['status'] || 'draft');

    if (!topic || !question || !answer) {
      console.log(`⚠️  Saltado (faltan campos obligatorios): "${topic || question || '(vacío)'}"`);
      skipped++;
      continue;
    }

    const payload = {
      topic,
      question,
      answer,
      tags,
      source,
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    };

    if (id) {
      const { error } = await supabase
        .from('whatsapp_knowledge_entries')
        .update(payload)
        .eq('id', id);

      if (error) {
        console.error(`❌ Error al actualizar "${topic}": ${error.message}`);
        errors++;
      } else {
        console.log(`✅ Actualizado: "${topic}"`);
        updated++;
      }
    } else {
      const { error } = await supabase
        .from('whatsapp_knowledge_entries')
        .insert(payload);

      if (error) {
        console.error(`❌ Error al crear "${topic}": ${error.message}`);
        errors++;
      } else {
        console.log(`✅ Creado: "${topic}"`);
        created++;
      }
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Creados:   ${created}`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Saltados:  ${skipped}`);
  console.log(`Errores:   ${errors}`);
  console.log(`Total:     ${rows.length}`);
}

const excelPath = process.argv[2] || resolve(projectRoot, 'docs', 'knowledge-entries.xlsx');
importKnowledge(excelPath).catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
