import type { LanguageProfile } from '../types.js';
import { goProfile, rustProfile } from './go-rust-profiles.js';
import { javascriptProfile, typescriptProfile } from './node-profiles.js';
import { csharpProfile, phpProfile } from './php-csharp-profiles.js';

export const PRIMARY_LANGUAGE_PROFILES: readonly LanguageProfile[] = Object.freeze([
  Object.freeze(typescriptProfile()),
  Object.freeze(javascriptProfile()),
  Object.freeze(goProfile),
  Object.freeze(rustProfile),
  Object.freeze(phpProfile),
  Object.freeze(csharpProfile),
]);
