/**
 * Registers the `@testing-library/jest-dom` matchers with Vitest's type system.
 *
 * The matchers are installed *at runtime* by the `import
 * '@testing-library/jest-dom/vitest'` line at the top of each JSX test, which is
 * why those suites pass — but a runtime side effect does not augment the
 * `Assertion` interface for `tsc`, so `expect(x).toBeInTheDocument()` typechecked
 * as an unknown property and failed the workspace typecheck while the tests were
 * green.
 *
 * A declaration file rather than a `types` entry in `tsconfig.json`: the `types`
 * array replaces the default type inclusion set, which would drop the ambient
 * node types the rest of the package relies on. This file only adds.
 */
import '@testing-library/jest-dom/vitest';
