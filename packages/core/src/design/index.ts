// Design Studio public surface. The implementation remains in execution while
// consumers migrate away from the package root; this facade keeps design
// concerns independently addressable without exposing unrelated execution APIs.
export * from '../execution/design-capture.js';
export * from '../execution/design-detect.js';
export * from '../execution/design-kit-loader.js';
export * from '../execution/design-materialize.js';
export * from '../execution/design-project-store.js';
export * from '../execution/design-tune.js';
export * from '../execution/design-verify.js';
export { isDesignStack, type DesignStack, type SkippedKitInfo } from '../types/design-kit.js';
