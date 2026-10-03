import {
  type ArtifactPresentation,
  parseArtifactPresentation,
} from '@wrongstack/tools/artifact-presentation';

const EVENT = 'simpleui:present-artifact';
export function onPresentArtifact(listener: (artifact: ArtifactPresentation) => void): () => void {
  const handle = (event: Event) => {
    const artifact = parseArtifactPresentation((event as CustomEvent).detail);
    if (artifact) listener(artifact);
  };
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
export function dispatchPresentArtifact(artifact: ArtifactPresentation): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(EVENT, { detail: artifact }));
}
