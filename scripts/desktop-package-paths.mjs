/**
 * Repository-relative staging path shared by Desktop packaging and smoke tests.
 *
 * Keep the deploy target outside `apps/desktop`: pnpm 12's legacy deploy engine
 * cannot atomically rename its pacquet staging directory when the destination
 * is nested inside the filtered Windows workspace package (Access denied, os 5).
 */
export const DESKTOP_PACKAGE_STAGE_RELATIVE = '.temp_files/package-desktop-stage';
