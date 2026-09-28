import { loadKit } from './catalog.js';
import { isKitVerified, kitHistory } from './service.js';

/** Shared read-only projection for model tools and the Project Kit browser. */
export async function inspectProjectKit(root: string, name: string) {
  const { manifest, revision, files } = await loadKit(root, name);
  const history = await kitHistory(root, name, 100);
  return {
    ...manifest,
    revision,
    verified: isKitVerified(history, revision),
    files: [...files.keys()],
    history,
  };
}
