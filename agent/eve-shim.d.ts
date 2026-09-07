declare module "eve" {
  // Minimal type shim for the Eve agent config used in Stage 1.
  // The real runtime contract is enforced by the smoke test.
  export function defineAgent<T>(definition: T): T;
}

declare module "eve/tools" {
  // Shim mínimo para tools de Eve mientras el proyecto usa
  // moduleResolution "node". Los exports de Eve requieren un resolver
  // más nuevo; tests y documentación de Eve cubren el contrato runtime.
  export function defineTool<TDefinition extends object>(definition: TDefinition): TDefinition;
}
