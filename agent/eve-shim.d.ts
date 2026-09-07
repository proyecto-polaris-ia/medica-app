declare module "eve" {
  // Minimal type shim for the Eve agent config used in Stage 1.
  // The real runtime contract is enforced by the smoke test.
  export function defineAgent<T>(definition: T): T;
}
