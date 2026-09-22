// Clean up the stray root-level helper left from round-2 investigation.
// Per the user's instruction: "adhoc scrpiptleri ana dizine yazma .temp_files/ klasörüne yaz".
// The file is no longer needed; the round-2 investigation is closed with no-proven-bug.
import { existsSync, unlinkSync } from 'node:fs';
const p = 'list-plugin-sizes.mjs';
if (existsSync(p)) {
  unlinkSync(p);
  console.log('removed', p);
} else {
  console.log('absent', p);
}
