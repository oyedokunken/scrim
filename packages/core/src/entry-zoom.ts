// Subpath entry for `@scrim/core/zoom`. It re-exports only zoom, camera and the input types,
// so a bundle that imports it never pulls in schema validation.
export * from './camera';
export * from './input';
export * from './zoom';
