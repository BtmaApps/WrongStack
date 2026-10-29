/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { AtlasBrief } from './atlas-brief.js';
import type { AtlasDocument, AtlasFreshness, WrittenAtlas } from './atlas-projection.js';
import type { FileCommunity } from './louvain.js';
import type { ConceptCoverage, ConceptEdge, Subsystem } from './writer-concepts.js';

export type CodebaseAtlasMode = 'brief' | 'full' | 'communities' | 'freshness' | 'write';

export interface CodebaseAtlasOutput {
  mode: CodebaseAtlasMode;
  indexed: boolean;
  freshness?: AtlasFreshness | undefined;
  conceptCoverage?: ConceptCoverage | undefined;
  brief?: AtlasBrief | undefined;
  document?: AtlasDocument | undefined;
  communities?: FileCommunity[] | undefined;
  subsystems?: Subsystem[] | undefined;
  conceptEdges?: ConceptEdge[] | undefined;
  written?: WrittenAtlas | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
