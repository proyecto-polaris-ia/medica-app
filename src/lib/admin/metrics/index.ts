/**
 * Barril de import estable de la librería pura de métricas (issue #88,
 * design.md §1.2). No exporta I/O: el loader de Supabase vive en
 * `loader.ts` (Fase 2), fuera de este barril.
 */

export * from './types';
export * from './occupancy';
export * from './no-show';
export * from './aggregate';
export * from './range';
export * from './transitions';
export * from './trend';
