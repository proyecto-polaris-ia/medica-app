#!/usr/bin/env node

/**
 * Genera un template vacío de Excel para artículos de conocimiento.
 * 
 * Uso:
 *   node scripts/create-knowledge-template.mjs
 * 
 * El archivo se genera en docs/knowledge-template.xlsx
 */

import * as XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const templateRows = [
  {
    'Tema': 'Horarios de atención',
    'Pregunta': '¿Cuáles son sus horarios?',
    'Respuesta': 'Nuestros horarios son de lunes a viernes de 9:00 a 14:00 y de 16:00 a 20:00. Sábados de 9:00 a 14:00.',
    'Etiquetas': 'horarios, atención, horario',
    'Fuente': '',
    'Estado': 'approved',
  },
  {
    'Tema': 'Ubicación',
    'Pregunta': '¿Dónde están ubicados?',
    'Respuesta': 'Estamos ubicados en Av. Ejemplo 123, Colonia Centro, Ciudad de México.',
    'Etiquetas': 'ubicación, dirección, dónde',
    'Fuente': '',
    'Estado': 'approved',
  },
  {
    'Tema': '',
    'Pregunta': '',
    'Respuesta': '',
    'Etiquetas': '',
    'Fuente': '',
    'Estado': 'draft',
  },
];

const worksheet = XLSX.utils.json_to_sheet(templateRows);

const colWidths = [
  { wch: 30 },
  { wch: 50 },
  { wch: 80 },
  { wch: 30 },
  { wch: 20 },
  { wch: 12 },
];
worksheet['!cols'] = colWidths;

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

const instructions = XLSX.utils.aoa_to_sheet([
  ['INSTRUCCIONES PARA LLENAR EL TEMPLATE'],
  [''],
  ['Columnas obligatorias:'],
  ['  - Tema: Tema o categoría del artículo (ej: "Horarios", "Servicios", "Ubicación")'],
  ['  - Pregunta: Pregunta que haría el paciente'],
  ['  - Respuesta: Respuesta que debe dar el agente'],
  [''],
  ['Columnas opcionales:'],
  ['  - Etiquetas: Palabras clave separadas por coma (ayudan a encontrar el artículo)'],
  ['  - Fuente: De dónde viene la información (opcional)'],
  ['  - Estado: draft (borrador) | approved (aprobado) | archived (archivado)'],
  [''],
  ['NOTA: No modifiques la columna "ID" si existe. Se usa para actualizar artículos existentes.'],
  [''],
  ['Una vez llenado, devuelve el archivo para cargar los cambios.'],
]);

const instructionsSheet = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(instructionsSheet, instructions, 'Instrucciones');
XLSX.utils.book_append_sheet(instructionsSheet, worksheet, 'Template');

const outputPath = resolve(projectRoot, 'docs', 'knowledge-template.xlsx');
XLSX.writeFile(instructionsSheet, outputPath);

console.log(`✅ Template generado: ${outputPath}`);
console.log('\nEl cliente puede:');
console.log('  1. Editar knowledge-entries.xlsx (artículos existentes)');
console.log('  2. Usar knowledge-template.xlsx para agregar artículos nuevos');
console.log('\nDespués de editar, ejecutar:');
console.log('  node scripts/import-knowledge-from-excel.mjs docs/knowledge-entries.xlsx');
